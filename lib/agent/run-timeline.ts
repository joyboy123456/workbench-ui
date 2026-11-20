import {
  PHASE1_ACTION_COPY_CATEGORIES,
  PHASE1_ACTION_STATES,
  PHASE1_AUTOMATIC_RETRY_LIMIT,
  PHASE1_BLOCKED_REASON_CODES,
  PHASE1_PHOTO_SLOT_STATES,
  PHASE1_RUN_EVENT_NAMES,
  PHASE1_RUN_EVENT_PHASES,
  PHASE1_TURN_OUTCOMES,
  type Phase1RunEventOptionalFields,
} from './phase1-photo-delivery-contract'

/**
 * 浏览器实时阶段协议的公开事件契约。
 *
 * 只承载服务端生成的安全投影：不包含提示词、思维链、模型原始输出、
 * 素材摘要哈希、请求工件或供应商文本。客户端不得自行推测或补造阶段。
 */
const LEGACY_AGENT_RUN_EVENT_NAMES = [
  'perception.completed',
  'reasoning.started',
  'reasoning.completed',
  'planning.started',
  'planning.completed',
  'tool.started',
  'tool.completed',
  'result.reviewing',
  'result.admitted',
  'result.quarantined',
] as const
export const AGENT_RUN_EVENT_NAMES = [...LEGACY_AGENT_RUN_EVENT_NAMES, ...PHASE1_RUN_EVENT_NAMES] as const
export type AgentRunEventName = typeof AGENT_RUN_EVENT_NAMES[number]

export const AGENT_RUN_PHASES = ['perception', 'reasoning', 'planning', 'execution'] as const
export type AgentRunPhase = typeof AGENT_RUN_PHASES[number]

export const AGENT_RUN_EVENT_STATUSES = ['started', 'completed', 'waiting', 'blocked', 'failed'] as const
export type AgentRunEventStatus = typeof AGENT_RUN_EVENT_STATUSES[number]

/** 事件名到「阶段 → 允许状态」的确定性映射；每个事件名只属于一个阶段。 */
export const AGENT_RUN_EVENT_TABLE: Readonly<Record<AgentRunEventName, { phase: AgentRunPhase; statuses: readonly AgentRunEventStatus[] }>> = Object.freeze({
  'perception.completed': { phase: 'perception', statuses: ['completed'] },
  'reasoning.started': { phase: 'reasoning', statuses: ['started'] },
  'reasoning.completed': { phase: 'reasoning', statuses: ['completed', 'blocked', 'failed'] },
  'planning.started': { phase: 'planning', statuses: ['started'] },
  'planning.completed': { phase: 'planning', statuses: ['completed', 'blocked', 'failed'] },
  'tool.started': { phase: 'execution', statuses: ['started'] },
  'tool.completed': { phase: 'execution', statuses: ['completed', 'blocked', 'failed'] },
  'result.reviewing': { phase: 'execution', statuses: ['waiting'] },
  'result.admitted': { phase: 'execution', statuses: ['completed'] },
  'result.quarantined': { phase: 'execution', statuses: ['blocked'] },
  'turn.accepted': { phase: PHASE1_RUN_EVENT_PHASES['turn.accepted'], statuses: ['completed'] },
  'turn.finished': { phase: PHASE1_RUN_EVENT_PHASES['turn.finished'], statuses: ['completed', 'blocked', 'failed'] },
  'action.updated': { phase: PHASE1_RUN_EVENT_PHASES['action.updated'], statuses: ['started', 'waiting', 'completed', 'blocked', 'failed'] },
  'plan.summary': { phase: PHASE1_RUN_EVENT_PHASES['plan.summary'], statuses: ['completed'] },
  'slot.updated': { phase: PHASE1_RUN_EVENT_PHASES['slot.updated'], statuses: ['completed', 'waiting', 'blocked', 'failed', 'started'] },
  'batch.summary': { phase: PHASE1_RUN_EVENT_PHASES['batch.summary'], statuses: ['completed'] },
  'turn.stopped': { phase: PHASE1_RUN_EVENT_PHASES['turn.stopped'], statuses: ['completed'] },
  'turn.heartbeat': { phase: PHASE1_RUN_EVENT_PHASES['turn.heartbeat'], statuses: ['started'] },
})

export interface AgentRunEvent extends Phase1RunEventOptionalFields {
  schemaVersion: 1
  /** 公开事件名；phase/status 必须与 AGENT_RUN_EVENT_TABLE 一致。 */
  name: AgentRunEventName
  /** 本轮运行身份；= 该轮助手消息 id，客户端用它把轨迹挂到对应消息。 */
  runId: string
  /** 本轮内从 1 单调递增；断线后按 after 游标续传，重复序号必须幂等。 */
  sequence: number
  /** 决策轮次，从 1 开始；工具结果后再次规划即第 2 轮。 */
  loop: number
  phase: AgentRunPhase
  status: AgentRunEventStatus
  /** 服务端生成的固定安全摘要。 */
  summary: string
  toolName?: string
  /** 仅结果准入类事件携带任务定位。 */
  taskId?: string
  occurredAt: string
}

export function isAgentRunEventName(value: unknown): value is AgentRunEventName {
  return typeof value === 'string' && (AGENT_RUN_EVENT_NAMES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}

function isText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || Boolean(value.trim()))
}

function isPositiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum
}

function isNonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum
}

function isActionFields(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['actionId', 'copyCategory', 'state', 'blockedReasonCode', 'nextStep', 'safeReference'])) return false
  if (!isText(value.actionId, 160)
    || !(PHASE1_ACTION_COPY_CATEGORIES as readonly unknown[]).includes(value.copyCategory)
    || !(PHASE1_ACTION_STATES as readonly unknown[]).includes(value.state)) return false
  const blocked = value.state === 'blocked'
  if (blocked !== (value.blockedReasonCode !== undefined && value.nextStep !== undefined)) return false
  if (value.blockedReasonCode !== undefined
    && !(PHASE1_BLOCKED_REASON_CODES as readonly unknown[]).includes(value.blockedReasonCode)) return false
  if (value.nextStep !== undefined && !isText(value.nextStep, 500)) return false
  if (value.safeReference !== undefined) {
    const reference = value.safeReference
    if (!isRecord(reference) || !hasOnlyKeys(reference, ['ids', 'count'])
      || !Array.isArray(reference.ids) || reference.ids.length > 20
      || !reference.ids.every(id => isText(id, 160)) || new Set(reference.ids).size !== reference.ids.length
      || !isNonNegativeInteger(reference.count)) return false
  }
  return true
}

function isPlanSummary(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value,
    ['outfitCount', 'imageCount', 'primaryGarment', 'outfits', 'automaticRetryLimit', 'quantityKind', 'recap'])) return false
  if (!isPositiveInteger(value.outfitCount, 10) || !isPositiveInteger(value.imageCount, 10)
    || !isText(value.primaryGarment, 200) || ![0, PHASE1_AUTOMATIC_RETRY_LIMIT].includes(value.automaticRetryLimit as number)
    || (value.quantityKind !== undefined && !['outfits', 'images'].includes(value.quantityKind as string))
    || !isText(value.recap, 500) || !Array.isArray(value.outfits)
    || value.outfits.length !== value.outfitCount) return false
  return value.outfits.every((outfit, index) => isRecord(outfit)
    && hasOnlyKeys(outfit, ['index', 'title', 'rationale'])
    && outfit.index === index + 1 && isText(outfit.title, 200) && isText(outfit.rationale, 500))
}

function isSlotFields(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ['batchId', 'slotId', 'state', 'attemptNumber', 'occurredAt', 'queuePosition'])
    && isText(value.batchId, 160) && isText(value.slotId, 160)
    && (PHASE1_PHOTO_SLOT_STATES as readonly unknown[]).includes(value.state)
    && isPositiveInteger(value.attemptNumber)
    && (value.queuePosition === undefined || isNonNegativeInteger(value.queuePosition))
    && isText(value.occurredAt, 64) && Number.isFinite(Date.parse(value.occurredAt))
}

function isBatchSummary(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['batchId', 'revision', 'counts'])
    || !isText(value.batchId, 160) || !isPositiveInteger(value.revision) || !isRecord(value.counts)) return false
  const counts = value.counts
  if (!hasOnlyKeys(counts, PHASE1_PHOTO_SLOT_STATES)
    || Object.keys(counts).length !== PHASE1_PHOTO_SLOT_STATES.length) return false
  return PHASE1_PHOTO_SLOT_STATES.every(state => isNonNegativeInteger(counts[state]))
}

const PAYLOAD_FIELDS = ['action', 'turnOutcome', 'planSummary', 'slot', 'batchSummary', 'stop', 'heartbeat'] as const

function hasExpectedPayload(event: Record<string, unknown>): boolean {
  const expected = event.name === 'turn.finished' ? 'turnOutcome'
    : event.name === 'action.updated' ? 'action'
      : event.name === 'plan.summary' ? 'planSummary'
        : event.name === 'slot.updated' ? 'slot'
          : event.name === 'batch.summary' ? 'batchSummary'
            : event.name === 'turn.stopped' ? 'stop'
              : event.name === 'turn.heartbeat' ? 'heartbeat' : undefined
  if (PAYLOAD_FIELDS.some(field => field !== expected && event[field] !== undefined)) return false
  if (!expected) return true
  if (expected === 'turnOutcome') return (PHASE1_TURN_OUTCOMES as readonly unknown[]).includes(event.turnOutcome)
  if (expected === 'action') return isActionFields(event.action)
    && (event.actionId === undefined || (event.action as Record<string, unknown>).actionId === event.actionId)
  if (expected === 'planSummary') return isPlanSummary(event.planSummary)
  if (expected === 'slot') return isSlotFields(event.slot)
  if (expected === 'batchSummary') return isBatchSummary(event.batchSummary)
  if (expected === 'stop') return isRecord(event.stop) && hasOnlyKeys(event.stop, ['inFlightSlotCount'])
    && isNonNegativeInteger(event.stop.inFlightSlotCount)
  return event.heartbeat === true
}

export function isAgentRunEvent(value: unknown): value is AgentRunEvent {
  if (!isRecord(value)) return false
  const event = value
  if (event.schemaVersion !== 1 || !isAgentRunEventName(event.name)) return false
  const table = AGENT_RUN_EVENT_TABLE[event.name]
  const keys = ['schemaVersion', 'name', 'runId', 'sequence', 'loop', 'phase', 'status', 'summary', 'toolName', 'taskId',
    'occurredAt', 'eventId', 'actionId', ...PAYLOAD_FIELDS]
  return hasOnlyKeys(event, keys)
    && isText(event.runId, 160)
    && Number.isSafeInteger(event.sequence) && (event.sequence as number) >= 1
    && Number.isSafeInteger(event.loop) && (event.loop as number) >= 1
    && event.phase === table.phase
    && table.statuses.includes(event.status as AgentRunEventStatus)
    && isText(event.summary, 200, event.name === 'turn.heartbeat')
    && (event.toolName === undefined || typeof event.toolName === 'string' && event.toolName.length <= 100)
    && (event.taskId === undefined || typeof event.taskId === 'string' && event.taskId.length <= 200)
    && (event.eventId === undefined || isText(event.eventId, 200))
    && (event.actionId === undefined || isText(event.actionId, 160))
    && typeof event.occurredAt === 'string'
    && hasExpectedPayload(event)
}

/** 存储写入幂等身份；slot.updated 字段不完整时不会产生身份键。 */
export function runEventRecordIdentityKey(event: Omit<AgentRunEvent, 'sequence' | 'occurredAt'>): string | undefined {
  if (event.name === 'slot.updated') {
    if (!event.slot || !isSlotFields(event.slot)) return undefined
    return JSON.stringify(['slot.updated', event.slot.batchId, event.slot.slotId, event.slot.attemptNumber, event.slot.state])
  }
  if ((PHASE1_RUN_EVENT_NAMES as readonly string[]).includes(event.name)) return undefined
  return JSON.stringify([
    event.name,
    event.loop,
    event.toolName ?? null,
    event.taskId ?? null,
    event.name.startsWith('result.') ? null : event.summary,
  ])
}

/** 幂等键：同一轮、同一序号视为同一事件，用于重连去重与重复投递降噪。 */
export function runEventKey(event: Pick<AgentRunEvent, 'runId' | 'sequence'>): string {
  return `${event.runId}:${event.sequence}`
}
