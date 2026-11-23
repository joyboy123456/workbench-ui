export const THREAD_SESSION_CACHE_KEY = 'THREAD_SESSION_CACHE'

export type AgentStreamEventType =
  | 'thread_start'
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'thread_end'
  | 'queue_update'
  | 'insufficient_quota'

export type AgentContentBlockType =
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'tool_event'
  | 'image'

export type ToolEventType =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'html_generation'
  | 'code_generation'
  | 'image_insight'
  | 'image_verification'
  | 'lora_recommendation'
  | (string & {})

export interface ToolEventPayload {
  type?: ToolEventType
  event_type?: ToolEventType
  data_type?: string
  status?: 'queued' | 'running' | 'done' | 'failed' | string
  title?: string
  summary?: string
  task_id?: string
  action_id?: string
  step_id?: string
  progress?: number
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface AgentContentBlock {
  index: number
  type: AgentContentBlockType
  id?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  partialJson?: string
  content?: ToolEventPayload | string | Record<string, unknown>
  output?: unknown
  image_url?: string
  is_error?: boolean
  status?: 'streaming' | 'complete' | 'error'
}

export interface AgentQueueState {
  queued: boolean
  position?: number
  actionId?: string
  stepId?: string
  toolCallIds?: string[]
  generatorTaskIds?: string[]
}

export interface AgentQuotaPauseState {
  paused: boolean
  reason?: string
  requiredCredits?: number
  restoreInfos?: Record<string, unknown>
}

export interface AgentStreamEventData {
  type: AgentStreamEventType
  thread_id?: string
  msg_id?: string
  index?: number
  content_block?: {
    type: AgentContentBlockType
    id?: string
    text?: string
    name?: string
    input?: Record<string, unknown>
    content?: ToolEventPayload | string | Record<string, unknown>
    original_output?: unknown
    image_url?: string
    is_error?: boolean
  }
  delta?: {
    text?: string
    partial_json?: string
    stop_reason?: string
  }
  queue?: {
    queued?: boolean
    position?: number
    action_id?: string
    step_id?: string
    skip_tool_call_ids?: string[]
    skip_generator_task_ids?: string[]
  }
  quota?: {
    reason?: string
    required_credits?: number
    restore_infos?: Record<string, unknown>
  }
}

export interface AgentStreamEnvelope {
  type?: string
  data: AgentStreamEventData
}

export interface AgentStreamResponse {
  message: string
  tool_calls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  thread_id: string
  blocks: AgentContentBlock[]
}

export interface AgentStreamHandlerCallbacks {
  onThreadStart?: (threadId: string, msgId?: string) => void
  onNewBlock?: (block: AgentContentBlock) => void
  onBlockUpdate?: (index: number, block: AgentContentBlock) => void
  onBlockComplete?: (index: number, block: AgentContentBlock) => void
  onNewToolEvent?: (event: ToolEventPayload) => void
  onQueueUpdate?: (queue: AgentQueueState) => void
  onInsufficientQuota?: (quota: AgentQuotaPauseState) => void
  onComplete?: (blocks: AgentContentBlock[], response: AgentStreamResponse) => void
  onError?: (error: unknown) => void
}

/**
 * 容错解析流式传输中的不完整 JSON 片段（对应 Lovart IncompleteJsonParser）。
 * 优先尝试原生 JSON.parse；失败时按栈自动闭合未结束字符串、裁掉悬空键/逗号/冒号并补齐括号。
 */
export function parseIncompleteJson(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    const direct: unknown = JSON.parse(trimmed)
    return direct && typeof direct === 'object' && !Array.isArray(direct) ? direct as Record<string, unknown> : undefined
  } catch { /* fall through to incremental repair */ }

  let inString = false
  let escaped = false
  const stack: Array<'{' | '['> = []
  let output = ''

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    output += ch
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' && stack[stack.length - 1] === '{') stack.pop()
    else if (ch === ']' && stack[stack.length - 1] === '[') stack.pop()
  }

  if (inString) {
    if (escaped) output = output.slice(0, -1)
    output += '"'
  }

  // 清理末尾悬空的逗号、冒号或无值键
  output = output.replace(/,\s*$/, '')
  if (/:\s*$/.test(output)) {
    output += 'null'
  } else if (stack[stack.length - 1] === '{' && /[{,]\s*"[^"]*"\s*$/.test(output)) {
    output += ':null'
  }
  output = output.replace(/,\s*$/, '')

  for (let i = stack.length - 1; i >= 0; i--) {
    output += stack[i] === '{' ? '}' : ']'
  }

  try {
    const repaired: unknown = JSON.parse(output)
    return repaired && typeof repaired === 'object' && !Array.isArray(repaired)
      ? repaired as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

interface InternalBlock extends AgentContentBlock {
  _potentialJson?: string
}

export class AgentStreamHandler {
  private contentBlocks = new Map<number, InternalBlock>()
  private messageComplete = false
  threadId = ''
  toolEvents: ToolEventPayload[] = []
  queueState: AgentQueueState = { queued: false }
  quotaPause: AgentQuotaPauseState = { paused: false }
  private callbacks: AgentStreamHandlerCallbacks

  constructor(callbacks: AgentStreamHandlerCallbacks = {}) {
    this.callbacks = callbacks
  }

  reset() {
    this.contentBlocks.clear()
    this.messageComplete = false
    this.threadId = ''
    this.toolEvents = []
    this.queueState = { queued: false }
    this.quotaPause = { paused: false }
  }

  getBlocks(): AgentContentBlock[] {
    return Array.from(this.contentBlocks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, block]) => this.snapshotBlock(block))
  }

  handleEvent(input: AgentStreamEnvelope | AgentStreamEventData) {
    const data = 'data' in input && input.data ? input.data : input as AgentStreamEventData
    try {
      switch (data.type) {
        case 'thread_start':
        case 'message_start':
          this.handleThreadStart(data)
          break
        case 'content_block_start':
          this.handleContentBlockStart(data)
          break
        case 'content_block_delta':
          this.handleContentBlockDelta(data)
          break
        case 'content_block_stop':
          this.handleContentBlockStop(data)
          break
        case 'queue_update':
          this.handleQueueUpdate(data)
          break
        case 'insufficient_quota':
          this.handleInsufficientQuota(data)
          break
        case 'thread_end':
          this.handleThreadEnd()
          break
        case 'message_delta':
        case 'message_stop':
          if (!this.messageComplete) this.handleThreadEnd()
          break
      }
    } catch (error) {
      this.callbacks.onError?.(error)
    }
  }

  handleStreamEnd() {
    if (!this.messageComplete) {
      this.handleThreadEnd()
    }
  }

  convertToResponse(): AgentStreamResponse {
    const blocks = this.getBlocks().filter(block => block.type !== 'text' || Boolean(block.text))
    const textBlocks = blocks.filter(block => block.type === 'text')
    const toolCalls = blocks
      .filter(block => block.type === 'tool_use' && Boolean(block.name))
      .map((block, index) => ({
        id: block.id || `tool-${index}`,
        type: 'function' as const,
        function: {
          name: block.name || '',
          arguments: JSON.stringify(block.input || {}),
        },
      }))
    return {
      message: textBlocks.map(block => block.text ?? '').join('\n'),
      tool_calls: toolCalls,
      thread_id: this.threadId,
      blocks,
    }
  }

  private snapshotBlock(block: InternalBlock): AgentContentBlock {
    const { _potentialJson: _ignored, ...clean } = block
    return {
      ...clean,
      ...(clean.input ? { input: { ...clean.input } } : {}),
    }
  }

  private handleThreadStart(data: AgentStreamEventData) {
    if (data.thread_id) this.threadId = data.thread_id
    if (this.queueState.queued) {
      this.queueState = { queued: false }
      this.callbacks.onQueueUpdate?.(this.queueState)
    }
    this.callbacks.onThreadStart?.(this.threadId, data.msg_id)
  }

  private handleContentBlockStart(data: AgentStreamEventData) {
    if (data.index === undefined || !data.content_block) return
    const src = data.content_block
    const block: InternalBlock = {
      index: data.index,
      type: src.type,
      id: src.id,
      text: src.text ?? '',
      name: src.name,
      input: src.input ? { ...src.input } : undefined,
      status: 'streaming',
    }
    if (src.content !== undefined) block.content = src.content
    if (src.original_output !== undefined) block.output = src.original_output
    if (src.image_url !== undefined) block.image_url = src.image_url
    if (src.is_error !== undefined) block.is_error = src.is_error

    if (block.type === 'tool_event' && src.content && typeof src.content === 'object') {
      const toolEvent = src.content as ToolEventPayload
      this.toolEvents.push(toolEvent)
      this.callbacks.onNewToolEvent?.(toolEvent)
    }

    this.contentBlocks.set(data.index, block)
    this.callbacks.onNewBlock?.(this.snapshotBlock(block))
  }

  private handleContentBlockDelta(data: AgentStreamEventData) {
    if (data.index === undefined || !data.delta) return
    const block = this.contentBlocks.get(data.index)
    if (!block) return

    if (data.delta.text !== undefined && block.type === 'text') {
      if (!block.text && block._potentialJson === undefined && data.delta.text.trim().startsWith('{')) {
        block._potentialJson = data.delta.text
        const parsed = parseIncompleteJson(block._potentialJson)
        if (parsed && 'should_hand_off' in parsed) {
          block.text = parsed.should_hand_off === true ? '' : typeof parsed.response === 'string' ? parsed.response : ''
        }
        this.callbacks.onBlockUpdate?.(data.index, this.snapshotBlock(block))
        return
      }
      if (block._potentialJson !== undefined) {
        block._potentialJson += data.delta.text
        const parsed = parseIncompleteJson(block._potentialJson)
        if (parsed && 'should_hand_off' in parsed) {
          block.text = parsed.should_hand_off === true ? '' : typeof parsed.response === 'string' ? parsed.response : ''
        }
        this.callbacks.onBlockUpdate?.(data.index, this.snapshotBlock(block))
        return
      }
      block.text = (block.text ?? '') + data.delta.text
    } else if (data.delta.partial_json !== undefined && block.type === 'tool_use') {
      block.partialJson = (block.partialJson ?? '') + data.delta.partial_json
      const parsed = parseIncompleteJson(block.partialJson)
      if (parsed) {
        block.input = { ...(block.input ?? {}), ...parsed }
      }
    }

    this.callbacks.onBlockUpdate?.(data.index, this.snapshotBlock(block))
  }

  private handleContentBlockStop(data: AgentStreamEventData) {
    if (data.index === undefined) return
    const block = this.contentBlocks.get(data.index)
    if (!block) return

    if (block._potentialJson !== undefined) {
      const parsed = parseIncompleteJson(block._potentialJson)
      if (parsed && 'should_hand_off' in parsed) {
        block.text = parsed.should_hand_off === true ? '' : typeof parsed.response === 'string' ? parsed.response : ''
      }
      delete block._potentialJson
    }

    if (block.type === 'tool_use' && block.partialJson) {
      const parsed = parseIncompleteJson(block.partialJson)
      if (parsed) {
        block.input = { ...(block.input ?? {}), ...parsed }
      }
      delete block.partialJson
    }

    block.status = block.is_error ? 'error' : 'complete'
    const snap = this.snapshotBlock(block)
    this.callbacks.onBlockUpdate?.(data.index, snap)
    this.callbacks.onBlockComplete?.(data.index, snap)
  }

  private handleQueueUpdate(data: AgentStreamEventData) {
    const q = data.queue
    this.queueState = {
      queued: q?.queued ?? true,
      position: q?.position,
      actionId: q?.action_id,
      stepId: q?.step_id,
      toolCallIds: q?.skip_tool_call_ids,
      generatorTaskIds: q?.skip_generator_task_ids,
    }
    this.callbacks.onQueueUpdate?.(this.queueState)
  }

  private handleInsufficientQuota(data: AgentStreamEventData) {
    this.quotaPause = {
      paused: true,
      reason: data.quota?.reason ?? '当前算力不足，充值或恢复配额后可继续当前任务',
      requiredCredits: data.quota?.required_credits,
      restoreInfos: data.quota?.restore_infos,
    }
    this.callbacks.onInsufficientQuota?.(this.quotaPause)
  }

  private handleThreadEnd() {
    this.messageComplete = true
    if (this.queueState.queued) {
      this.queueState = { queued: false }
      this.callbacks.onQueueUpdate?.(this.queueState)
    }
    for (const block of this.contentBlocks.values()) {
      if (block.status === 'streaming') block.status = 'complete'
    }
    const response = this.convertToResponse()
    this.callbacks.onComplete?.(response.blocks, response)
  }
}

export interface ThreadSessionEntry {
  threadId: string
  projectId: string
  updatedAt: number
  lastMessageId?: string
}

type ThreadSessionCacheMap = Record<string, ThreadSessionEntry>

function generateThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function readThreadSessionCache(): ThreadSessionCacheMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(THREAD_SESSION_CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ThreadSessionCacheMap : {}
  } catch {
    return {}
  }
}

export function saveThreadSessionEntry(projectId: string, entry: Partial<ThreadSessionEntry> & { threadId: string }): ThreadSessionEntry {
  const cache = readThreadSessionCache()
  const next: ThreadSessionEntry = {
    projectId,
    threadId: entry.threadId,
    updatedAt: entry.updatedAt ?? Date.now(),
    ...(entry.lastMessageId ? { lastMessageId: entry.lastMessageId } : {}),
  }
  cache[projectId] = next
  // 控制缓存体积，仅保留最近 50 个项目线程
  const entries = Object.entries(cache)
  if (entries.length > 50) {
    entries.sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0))
    const trimmed = Object.fromEntries(entries.slice(0, 50))
    try { localStorage.setItem(THREAD_SESSION_CACHE_KEY, JSON.stringify(trimmed)) } catch { /* ignore */ }
  } else {
    try { localStorage.setItem(THREAD_SESSION_CACHE_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
  }
  return next
}

export function getOrCreateThreadId(projectId: string): string {
  const existing = readThreadSessionCache()[projectId]
  if (existing?.threadId) return existing.threadId
  const threadId = generateThreadId()
  saveThreadSessionEntry(projectId, { threadId })
  return threadId
}

export function clearThreadSessionEntry(projectId: string) {
  const cache = readThreadSessionCache()
  if (!(projectId in cache)) return
  delete cache[projectId]
  try { localStorage.setItem(THREAD_SESSION_CACHE_KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}
