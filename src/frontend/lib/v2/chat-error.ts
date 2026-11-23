import { z } from 'zod'

/** 展示与重试资格，不是执行授权；重试执行由冻结请求协议另行核验。retryAfter 单位为秒。 */
export const chatErrorSchema = z.object({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_:-]{0,159}$/),
  status: z.number().int().min(400).max(599).optional(),
  category: z.enum(['acceptance_unknown', 'rate_limited', 'invalid_input', 'model_provider', 'auth', 'timeout', 'stream_format']),
  retryable: z.boolean(), retryAfter: z.number().finite().nonnegative().optional(),
  receiptState: z.enum(['unknown', 'not_accepted', 'accepted', 'settled']),
}).strict().refine(value => !value.retryable || ['not_accepted', 'settled'].includes(value.receiptState), '受理未知或仍在途时不得开放重试')
export type ChatError = z.infer<typeof chatErrorSchema>
export const chatErrorLabels: Record<ChatError['category'], string> = {
  acceptance_unknown: '暂时无法确认任务进度', rate_limited: '队列满或请求受限', invalid_input: '输入无效',
  model_provider: '模型或供应商错误', auth: '登录失效', timeout: '请求超时', stream_format: '进度流格式异常',
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined
  if (/^\d+(\.\d+)?$/.test(value.trim())) {
    const seconds = Math.ceil(Number(value))
    return Number.isFinite(seconds) ? seconds : undefined
  }
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined
}

/** 缺少受理证据时默认 unknown，绝不从 HTTP 5xx 推断“没生成”。 */
export function classifyChatError(code: string, status?: number, receiptState?: ChatError['receiptState'], retryAfter?: number): ChatError {
  const normalized = code.toUpperCase()
  const category: ChatError['category'] = status === 401 || status === 403 ? 'auth'
    : /TIMEOUT|ABORTED/.test(normalized) || status === 408 || status === 504 ? 'timeout'
      : /STREAM.*(INVALID|FORMAT|GAP)/.test(normalized) ? 'stream_format'
        : status === 429 || /QUEUE_(FULL|CAPACITY)|LIMIT_REACHED|RATE_LIMIT|DAILY_LIMIT|TURN_QUOTA|^BUSY$/.test(normalized) ? 'rate_limited'
          : /INVALID_INPUT|INVALID_REQUEST|ASSET_NOT_FOUND|IMAGE_UNAVAILABLE|IMAGE_LIMIT_EXCEEDED/.test(normalized)
            || normalized === 'AGENT_BETA_RETRY_NOT_ALLOWED' || status === 400 || status === 422 ? 'invalid_input'
            : /MODEL|PROVIDER|PLANNER/.test(normalized) ? 'model_provider' : 'acceptance_unknown'
  const receipt = receiptState ?? (['auth', 'invalid_input', 'rate_limited'].includes(category) ? 'not_accepted' : 'unknown')
  return { code, ...(status === undefined ? {} : { status }), category, receiptState: receipt,
    retryable: ['not_accepted', 'settled'].includes(receipt) && ['rate_limited', 'model_provider', 'timeout'].includes(category),
    ...(retryAfter === undefined ? {} : { retryAfter }) }
}

export function chatErrorAction(error: ChatError): string {
  if (error.category === 'auth') return '登录已失效，请重新登录后核实原任务。'
  if (error.category === 'stream_format') return '进度流格式异常，正在读取任务快照；请核实原任务，不要重复生成。'
  if (error.category === 'rate_limited' || error.retryAfter !== undefined) {
    return `${error.retryAfter === undefined ? '请等待队列空闲' : `请等待 ${Math.ceil(error.retryAfter)} 秒（Retry-After）`}${error.receiptState === 'unknown' ? '，然后核实原任务' : '后再试'}；不会自动重发。`
  }
  if (error.receiptState === 'unknown' || error.receiptState === 'accepted') return '任务可能仍在处理。请点击「核实原任务」查看最新进度，避免重复生成。'
  if (error.code === 'AGENT_BETA_RETRY_NOT_ALLOWED') return '请查看上一轮任务状态或回答待补充的问题。'
  if (error.category === 'invalid_input') return '请修改输入或参考图后再提交。'
  return error.retryable ? '允许重试；请保留原请求，重试前须核验冻结参数。' : '请核实原任务或联系管理员。'
}

export class ChatRequestError extends Error {
  constructor(message: string, readonly failure: ChatError) { super(message); this.name = 'ChatRequestError' }
}

export function requestFailure(error: unknown, receiptState: ChatError['receiptState'] = 'unknown'): ChatError {
  if (error instanceof ChatRequestError) return error.failure
  const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
  return classifyChatError(timeout ? 'CHAT_TIMEOUT' : error instanceof TypeError ? 'CHAT_NETWORK_ERROR' : 'CHAT_ACCEPTANCE_UNKNOWN', undefined, receiptState)
}

/** Only local transport failures can be retired by a later successful conversation. */
export function isChatTransportFailure(failure: ChatError | undefined): boolean {
  return Boolean(failure && /^(CHAT_HTTP_(502|503|504)|CHAT_NETWORK_ERROR)$/.test(failure.code))
}
