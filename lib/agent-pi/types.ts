import type { TaskStatus } from '@/lib/types'

/** 新运行时的版本标识；随每轮记录和每个动作持久化，用于按创建版本分流。 */
export const PI_RUNTIME_VERSION = 'pi-agent-v1' as const
export type PiRuntimeVersion = typeof PI_RUNTIME_VERSION

/**
 * 一次逻辑动作面向用户的状态。
 * submitting：已记录、尚未确认任务创建；unknown：无法确认是否提交，不会自动重提；
 * rejected：提交前被拒绝，没有产生任务。其余取值对应真实任务状态。
 */
export const PI_ACTION_STATES = ['submitting', 'pending', 'running', 'success', 'partial', 'failed', 'cancelled', 'unknown', 'rejected'] as const
export type PiActionState = typeof PI_ACTION_STATES[number]

export type PiActionAdmission = 'not_applicable' | 'pending' | 'admitted' | 'quarantined'

/** 动作的浏览器安全投影：不含提示词、参数、素材摘要或供应商信息。 */
export interface PiActionView {
  actionId: string
  capabilityId: string
  /** 服务端从能力目录取的名称。 */
  label: string
  state: PiActionState
  admission: PiActionAdmission
  taskId?: string
  /** 0–100，仅 pending/running 时有意义。 */
  progress?: number
  completedUnits?: number
  slotIds?: Array<string | null>
  expectedResultCount: number
  /** 已通过准入并放上画布的张数。 */
  resultCount: number
  /** 仅明确失败且后端允许时为 true。 */
  retryable?: boolean
  /** 整轮重跑的必要条件之一：该动作明确失败且没有成片。 */
  canRepeatRequest?: true
  /** 多屏详情页全部成功后的长图下载地址，由服务端生成。 */
  longImageHref?: string
}

export interface PiRunView {
  runtime: PiRuntimeVersion
  actions: PiActionView[]
}

export function piActionStateForTask(status: TaskStatus, unconfirmed: boolean): PiActionState {
  if (unconfirmed) return 'unknown'
  return status
}

export function isPiActionSettled(state: PiActionState): boolean {
  return state !== 'submitting' && state !== 'pending' && state !== 'running'
}

/** 仍需轮询的动作：任务未结束，或已结束但成功结果尚未完成准入。 */
export function piActionNeedsRefresh(action: Pick<PiActionView, 'state' | 'admission'>): boolean {
  if (!isPiActionSettled(action.state)) return true
  return (action.state === 'success' || action.state === 'partial') && action.admission === 'pending'
}
