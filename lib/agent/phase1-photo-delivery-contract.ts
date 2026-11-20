/**
 * Aora 阶段 1「逐张交付」的共享目标契约。
 *
 * 本模块导出跨票类型与常量。已接线字段只写入既有开放 JSON 容器或阶段 1 sidecar；
 * 旧 strict 表的外层形状不扩充，字段缺失仍由旧逻辑处理。
 */

export const PHASE1_PER_SLOT_ADMISSION_VERSION = 'phase1-per-slot-admission-v1' as const
export const PHASE1_SHOOTING_RULE_VERSION = 'phase1-default-shooting-v1' as const

export interface Phase1FrozenPolicyVersions {
  /** 创建 Agent 拍摄批次时冻结；缺失表示旧的整任务准入。 */
  perSlotAdmissionVersion?: typeof PHASE1_PER_SLOT_ADMISSION_VERSION
  /** 可移植的批次投影；当前 V1 turn 实际冻结在 input.shootingRule.version。 */
  shootingRuleVersion?: typeof PHASE1_SHOOTING_RULE_VERSION
}

export const PHASE1_DEFAULT_OUTFIT_COUNT = 5
export const PHASE1_AUTOMATIC_RETRY_LIMIT = 5
export const PHASE1_PLAN_CONFIRMATION_THRESHOLD = 8
export const PHASE1_BATCH_IMAGE_LIMIT = 10
export const PHASE1_MICRO_EDIT_IMAGE_COUNT = 1
export const PHASE1_RECOGNITION_WAIT_MS = 60_000
export const PHASE1_TURN_HEARTBEAT_INTERVAL_MS = 20_000
export const PHASE1_TURN_STALE_AFTER_MS = 60_000
export const PHASE1_EVENT_POLL_FALLBACK_MS = 1_500
/** 新版本项目流可按游标重放的滚动窗口；完整尝试事实不存放在事件窗口。 */
export const PHASE1_PROJECT_EVENT_REPLAY_WINDOW_LIMIT = 500

/** 独立站实测后允许调整的初值；其余常量属于阶段 1 产品规则。 */
export const PHASE1_TUNABLE_INITIAL_LIMITS = {
  recognitionWaitMs: PHASE1_RECOGNITION_WAIT_MS,
  turnHeartbeatIntervalMs: PHASE1_TURN_HEARTBEAT_INTERVAL_MS,
  turnStaleAfterMs: PHASE1_TURN_STALE_AFTER_MS,
  eventPollFallbackMs: PHASE1_EVENT_POLL_FALLBACK_MS,
} as const

export const PHASE1_CREATION_INTENTS = [
  'create',
  'consult',
  'outfit_only',
  'pause',
  'confirm_plan',
  'continue_shooting',
  'stop',
] as const
export type Phase1CreationIntent = typeof PHASE1_CREATION_INTENTS[number]

export const PHASE1_QUANTITY_KINDS = [
  'default',
  'outfits',
  'images',
  'repeat_default',
  'repeat_previous',
  'none',
] as const
export type Phase1QuantityKind = typeof PHASE1_QUANTITY_KINDS[number]

/** 当前项目上一批已提交计划的服务端安全投影；不从实际到片数反推。 */
export interface Phase1SubmittedShootingPlanQuantity {
  quantityKind: 'outfits' | 'images'
  outfitCount: number
  imageCount: number
}

/** 新 Agent turn 的冻结出片规则；缺失时必须走历史规则。 */
export interface Phase1FrozenShootingRule {
  version: typeof PHASE1_SHOOTING_RULE_VERSION
  automaticRetryLimit: 0 | typeof PHASE1_AUTOMATIC_RETRY_LIMIT
  primaryGarment?: string
  previousSubmittedPlan?: Phase1SubmittedShootingPlanQuantity
}

export const PHASE1_PHOTO_SLOT_STATES = [
  'generating',
  'admitted',
  'verifying',
  'unverifiable',
  'failed',
  'manual_review',
  'not_executed',
] as const
export type Phase1PhotoSlotState = typeof PHASE1_PHOTO_SLOT_STATES[number]

/** 不依赖失败原因、剩余自动次数或停止状态即可判定为终态的状态。 */
export const PHASE1_UNCONDITIONAL_TERMINAL_PHOTO_SLOT_STATES = [
  'admitted',
  'unverifiable',
  'manual_review',
  'not_executed',
] as const satisfies readonly Phase1PhotoSlotState[]
export type Phase1UnconditionalTerminalPhotoSlotState = typeof PHASE1_UNCONDITIONAL_TERMINAL_PHOTO_SLOT_STATES[number]

export const PHASE1_RETRYABLE_FAILURE_REASON_CODES = [
  'provider_failed',
  'provider_text_rejected',
  'download_final_failure',
] as const
export type Phase1RetryableFailureReasonCode = typeof PHASE1_RETRYABLE_FAILURE_REASON_CODES[number]

export const PHASE1_NON_RETRYABLE_FAILURE_REASON_CODES = [
  'execution_config_unavailable',
  'execution_auth_failed',
  'execution_quota_exhausted',
] as const
export type Phase1NonRetryableFailureReasonCode = typeof PHASE1_NON_RETRYABLE_FAILURE_REASON_CODES[number]

export const PHASE1_EXPLICIT_FAILURE_REASON_CODES = [
  ...PHASE1_RETRYABLE_FAILURE_REASON_CODES,
  ...PHASE1_NON_RETRYABLE_FAILURE_REASON_CODES,
] as const
export type Phase1ExplicitFailureReasonCode = Phase1RetryableFailureReasonCode | Phase1NonRetryableFailureReasonCode

export const PHASE1_UNVERIFIABLE_REASON_CODES = [
  'result_sync_timeout',
  'result_connection_lost',
  'result_lost_after_restart',
  'legacy_task_lost_after_restart',
] as const
export type Phase1UnverifiableReasonCode = typeof PHASE1_UNVERIFIABLE_REASON_CODES[number]

export const PHASE1_MANUAL_REVIEW_REASON_CODES = [
  'result_admission_rejected',
  'batch_credential_mismatch',
  'post_admission_recheck_failed',
] as const
export type Phase1ManualReviewReasonCode = typeof PHASE1_MANUAL_REVIEW_REASON_CODES[number]

export const PHASE1_BLOCKED_REASON_CODES = [
  'missing_primary_image',
  'no_available_model',
  'conflicting_requirements',
  'no_available_accompaniment',
  'primary_image_unusable',
  'batch_limit_exceeded',
] as const
export type Phase1BlockedReasonCode = typeof PHASE1_BLOCKED_REASON_CODES[number]

export type Phase1SlotReasonCode =
  | Phase1ExplicitFailureReasonCode
  | Phase1UnverifiableReasonCode
  | Phase1ManualReviewReasonCode
  | 'batch_stopped_before_submit'
  | 'local_result_verification_pending'

export type Phase1ReasonCode = Phase1SlotReasonCode | Phase1BlockedReasonCode

export interface Phase1ReasonDefinition {
  category: 'retryable_failure' | 'non_retryable_failure' | 'unverifiable' | 'manual_review' | 'not_executed' | 'verifying' | 'blocked'
  nextStep: string
  canAutoRetry: boolean
  /** 原因类别是否具备手动重拍资格；项目视图仍须结合次数与旧任务裁决输出当前布尔值。 */
  canManualReshoot: boolean
}

/** 用户可读下一步与重试能力的单一来源；旧任务重启丢失明确禁止原位重拍。 */
export const PHASE1_REASON_DEFINITIONS = {
  provider_failed: { category: 'retryable_failure', nextStep: '等待系统原位补图；次数用完后可手动重拍', canAutoRetry: true, canManualReshoot: true },
  provider_text_rejected: { category: 'retryable_failure', nextStep: '等待系统原位补图；次数用完后可手动重拍', canAutoRetry: true, canManualReshoot: true },
  download_final_failure: { category: 'retryable_failure', nextStep: '等待系统原位补图；次数用完后可手动重拍', canAutoRetry: true, canManualReshoot: true },
  execution_config_unavailable: { category: 'non_retryable_failure', nextStep: '修复生成配置后重新发起创作', canAutoRetry: false, canManualReshoot: false },
  execution_auth_failed: { category: 'non_retryable_failure', nextStep: '恢复生成服务鉴权后重新发起创作', canAutoRetry: false, canManualReshoot: false },
  execution_quota_exhausted: { category: 'non_retryable_failure', nextStep: '等待供应商额度恢复后重新发起创作', canAutoRetry: false, canManualReshoot: false },
  result_sync_timeout: { category: 'unverifiable', nextStep: '可手动重拍这一位', canAutoRetry: false, canManualReshoot: true },
  result_connection_lost: { category: 'unverifiable', nextStep: '可手动重拍这一位', canAutoRetry: false, canManualReshoot: true },
  result_lost_after_restart: { category: 'unverifiable', nextStep: '可手动重拍这一位', canAutoRetry: false, canManualReshoot: true },
  legacy_task_lost_after_restart: { category: 'unverifiable', nextStep: '发送新的创作请求', canAutoRetry: false, canManualReshoot: false },
  result_admission_rejected: { category: 'manual_review', nextStep: '等待人工核对', canAutoRetry: false, canManualReshoot: false },
  batch_credential_mismatch: { category: 'manual_review', nextStep: '等待人工核对整批凭据', canAutoRetry: false, canManualReshoot: false },
  post_admission_recheck_failed: { category: 'manual_review', nextStep: '等待人工核对；该位不再用于新的收藏案例', canAutoRetry: false, canManualReshoot: false },
  batch_stopped_before_submit: { category: 'not_executed', nextStep: '明确说“继续拍完”后按原计划提交', canAutoRetry: false, canManualReshoot: false },
  local_result_verification_pending: { category: 'verifying', nextStep: '等待本地确认结果', canAutoRetry: false, canManualReshoot: false },
  missing_primary_image: { category: 'blocked', nextStep: '上传或明确选择主推原图', canAutoRetry: false, canManualReshoot: false },
  no_available_model: { category: 'blocked', nextStep: '先在店铺模特库添加可用模特', canAutoRetry: false, canManualReshoot: false },
  conflicting_requirements: { category: 'blocked', nextStep: '澄清互相冲突的要求', canAutoRetry: false, canManualReshoot: false },
  no_available_accompaniment: { category: 'blocked', nextStep: '上传所需的陪衬单品', canAutoRetry: false, canManualReshoot: false },
  primary_image_unusable: { category: 'blocked', nextStep: '换一张清晰且能打开的主推原图', canAutoRetry: false, canManualReshoot: false },
  batch_limit_exceeded: { category: 'blocked', nextStep: '把本批调整到最多 10 张', canAutoRetry: false, canManualReshoot: false },
} as const satisfies Readonly<Record<Phase1ReasonCode, Phase1ReasonDefinition>>

export interface Phase1ReasonView<Code extends Phase1ReasonCode = Phase1ReasonCode> {
  code: Code
  nextStep: string
  /** 当前这一位现在是否展示重拍；不能直接复制原因定义中的资格值。 */
  canManualReshoot: boolean
}

/** 经项目读取鉴权后返回的稳定身份引用；事件流不得携带它或任何图片地址。 */
export interface Phase1AuthorizedImageReference {
  assetId: string
  nodeId: string
  taskId: string
}

interface Phase1PhotoSlotBase {
  /** Result consumption health is independent of C8 admission and supplier state. */
  deliveryProcessing?: {
    state: 'retrying' | 'blocked' | 'awaiting_continue' | 'stopped' | 'unverifiable'
    nextStep: string
    canContinue: boolean
  }
  /** 鉴权读取时投影当前批次停止事实；旧视图缺省不推断停止。 */
  batchStopped?: boolean
  batchId: string
  slotId: string
  /** 拍摄计划中的固定序号，从 1 开始；不按完成先后重排。 */
  slotIndex: number
  /** 每次实际生成都递增；自动、手动重拍与继续拍完共用这一总序号。 */
  attemptNumber: number
  /** 冻结真实能力；票 11 接通前的新批次为 0，之后的新批次才可为 5。 */
  automaticRetryLimit: 0 | typeof PHASE1_AUTOMATIC_RETRY_LIMIT
  automaticRetriesUsed: number
}

export interface Phase1GeneratingPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'generating'
  /** 只有调度器确认排队后才存在；表示前面仍有多少张。 */
  queuePosition?: number
  /** 当前正在执行第 k 次自动补图；项目读取据此显示“补图中 k/5”。 */
  activeAutomaticRetryNumber?: number
  imageRef?: never
}

export type Phase1SlotProgressState = 'queued' | 'generating' | 'verifying'

/** 供应商请求到本地落盘之间的可恢复进度；终态仍以 settlement receipt 为准。 */
export interface Phase1SlotProgressNotification {
  batchId: string
  slotId: string
  attemptNumber: number
  state: Phase1SlotProgressState
  occurredAt: string
  queuePosition?: number
  providerTerminalAt?: string
}

export type Phase1SlotNotification = Phase1SlotProgressNotification | Phase1SlotSettledNotification

export interface Phase1AdmittedPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'admitted'
  imageRef: Phase1AuthorizedImageReference
}

export interface Phase1VerifyingPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'verifying'
  reason: Phase1ReasonView<'local_result_verification_pending'>
  imageRef?: never
}

export interface Phase1UnverifiablePhotoSlotView extends Phase1PhotoSlotBase {
  state: 'unverifiable'
  reason: Phase1ReasonView<Phase1UnverifiableReasonCode>
  imageRef?: never
}

export interface Phase1FailedPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'failed'
  reason: Phase1ReasonView<Phase1ExplicitFailureReasonCode>
  /** 第 k 次自动补图显示为“补图中 k/5”；手动重拍不改变此数。 */
  activeAutomaticRetryNumber?: number
  imageRef?: never
}

export interface Phase1ManualReviewPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'manual_review'
  reason: Phase1ReasonView<Phase1ManualReviewReasonCode>
  imageRef?: never
}

export interface Phase1NotExecutedPhotoSlotView extends Phase1PhotoSlotBase {
  state: 'not_executed'
  reason: Phase1ReasonView<'batch_stopped_before_submit'>
  imageRef?: never
}

/** 项目读取返回的前端唯一成片位事实；只有 admitted 分支能带 imageRef。 */
export type Phase1PhotoSlotView =
  | Phase1GeneratingPhotoSlotView
  | Phase1AdmittedPhotoSlotView
  | Phase1VerifyingPhotoSlotView
  | Phase1UnverifiablePhotoSlotView
  | Phase1FailedPhotoSlotView
  | Phase1ManualReviewPhotoSlotView
  | Phase1NotExecutedPhotoSlotView

export const PHASE1_SLOT_SETTLEMENT_RESULTS = ['persisted', 'explicit_failure', 'unverifiable'] as const
export type Phase1SlotSettlementResult = typeof PHASE1_SLOT_SETTLEMENT_RESULTS[number]

interface Phase1SlotSettlementBase {
  batchId: string
  slotId: string
  attemptNumber: number
  occurredAt: string
}

/** 执行器在该次尝试结束且结果已持久化后发出的唯一 Agent 层通知。 */
export type Phase1SlotSettledNotification =
  | (Phase1SlotSettlementBase & { result: 'persisted' })
  | (Phase1SlotSettlementBase & {
    result: 'explicit_failure'
    reasonCode: Phase1RetryableFailureReasonCode
    retryability: 'retryable'
  })
  | (Phase1SlotSettlementBase & {
    result: 'explicit_failure'
    reasonCode: Phase1NonRetryableFailureReasonCode
    retryability: 'not_retryable'
  })
  | (Phase1SlotSettlementBase & {
    result: 'unverifiable'
    reasonCode: Phase1UnverifiableReasonCode
  })

export const PHASE1_TURN_OUTCOMES = ['completed', 'blocked', 'stopped', 'failed'] as const
export type Phase1TurnOutcome = typeof PHASE1_TURN_OUTCOMES[number]

/** 项目级暂停、本轮生命周期与拍摄批次生命周期是三套独立状态。 */
export interface Phase1ProjectPauseState {
  paused: boolean
  changedAt: string
  changedByRunId: string
}

export type Phase1TurnLifecycle =
  | { state: 'accepted' | 'running'; runId: string }
  | { state: 'finished'; runId: string; outcome: Phase1TurnOutcome }

export type Phase1BatchLifecycle =
  | { state: 'running'; batchId: string }
  | { state: 'stopped'; batchId: string; inFlightSlotCount: number }
  | { state: 'terminal'; batchId: string; summary: Phase1BatchSummaryCounts }

export type Phase1BatchSummaryCounts = Readonly<Record<Phase1PhotoSlotState, number>>

export const PHASE1_ACTION_COPY_CATEGORIES = [
  'recognizing_garments',
  'viewing_images',
  'searching_wardrobe',
  'matching_outfits',
  'submitting_shoot',
  'loading_skill',
  'checking_assets',
  'checking_canvas',
  'checking_task',
  'viewing_models',
  'searching_references',
  'proposing_outfits',
  'preparing_images',
  'preparing_cutout',
  'stopping_task',
  'retrying_shots',
] as const
export type Phase1ActionCopyCategory = typeof PHASE1_ACTION_COPY_CATEGORIES[number]

export const PHASE1_ACTION_STATES = ['running', 'queued', 'completed', 'blocked', 'failed'] as const
export type Phase1ActionState = typeof PHASE1_ACTION_STATES[number]

export interface Phase1ActionEventFields {
  actionId: string
  copyCategory: Phase1ActionCopyCategory
  state: Phase1ActionState
  blockedReasonCode?: Phase1BlockedReasonCode
  nextStep?: string
  /** 只允许编号和数量，不得放入素材、提示词或供应商内容。 */
  safeReference?: { ids: string[]; count: number }
}

export interface Phase1PlanSummaryFields {
  outfitCount: number
  imageCount: number
  primaryGarment: string
  outfits: Array<{ index: number; title: string; rationale: string }>
  automaticRetryLimit: 0 | typeof PHASE1_AUTOMATIC_RETRY_LIMIT
  /** 新摘要写入；历史摘要缺省时不反推用户原话单位。 */
  quantityKind?: 'outfits' | 'images'
  recap: string
}

export const PHASE1_RUN_EVENT_NAMES = [
  'turn.accepted',
  'turn.finished',
  'action.updated',
  'plan.summary',
  'slot.updated',
  'batch.summary',
  'turn.stopped',
  'turn.heartbeat',
] as const
export type Phase1RunEventName = typeof PHASE1_RUN_EVENT_NAMES[number]

/** 阶段 1 事件仍归入 v1 的四个阶段；后续票接线前此表不进入现有校验器。 */
export const PHASE1_RUN_EVENT_PHASES = {
  'turn.accepted': 'perception',
  'turn.finished': 'execution',
  'action.updated': 'execution',
  'plan.summary': 'planning',
  'slot.updated': 'execution',
  'batch.summary': 'execution',
  'turn.stopped': 'execution',
  'turn.heartbeat': 'execution',
} as const

export interface Phase1RunEventOptionalFields {
  eventId?: string
  actionId?: string
  action?: Phase1ActionEventFields
  turnOutcome?: Phase1TurnOutcome
  planSummary?: Phase1PlanSummaryFields
  slot?: {
    batchId: string
    slotId: string
    state: Phase1PhotoSlotState
    attemptNumber: number
    occurredAt: string
    queuePosition?: number
  }
  batchSummary?: {
    batchId: string
    revision: number
    counts: Phase1BatchSummaryCounts
  }
  stop?: { inFlightSlotCount: number }
  heartbeat?: true
}

export const PHASE1_EVENT_IDENTITY_RULES = {
  slot: ['batchId', 'slotId', 'attemptNumber', 'state'],
  batchSummary: ['runId', 'batchId', 'revision'],
  other: ['runId', 'sequence'],
} as const

/** 服务端签发的不透明项目级游标；客户端只保存并原样回传。 */
export type Phase1ProjectEventCursor = string

/** 项目事件流只发变化信号，不携带 imageRef、图片地址或业务工件。 */
export interface Phase1ProjectEventSignal {
  eventId: string
  projectId: string
  runId: string
  eventName: import('./run-timeline').AgentRunEventName
  occurredAt: string
}

export const PHASE1_PROJECT_EVENT_RESYNC_REASONS = ['cursor_expired'] as const
export type Phase1ProjectEventResyncReason = typeof PHASE1_PROJECT_EVENT_RESYNC_REASONS[number]

/** 游标已离开保留窗口时，只要求鉴权重读项目，不携带项目内容或图片。 */
export interface Phase1ProjectEventResyncRequired {
  kind: 'resync_required'
  projectId: string
  cursor: Phase1ProjectEventCursor
  reason: Phase1ProjectEventResyncReason
  occurredAt: string
}

export type Phase1ProjectEventStreamFrame =
  | { kind: 'event'; cursor: Phase1ProjectEventCursor; event: Phase1ProjectEventSignal }
  | { kind: 'keepalive'; occurredAt: string }
  | Phase1ProjectEventResyncRequired

export interface Phase1StopProjectRequest {
  projectId: string
}

export interface Phase1StopProjectResponse {
  projectId: string
  stopped: true
  inFlightSlotCount: number
}

export const PHASE1_APPEND_ATTEMPT_KINDS = ['automatic_retry', 'manual_reshoot', 'continue_shooting'] as const
export type Phase1AppendAttemptKind = typeof PHASE1_APPEND_ATTEMPT_KINDS[number]

interface Phase1AppendAttemptBase {
  batchId: string
  slotId: string
  attemptNumber: number
  /** 由服务端从三元组生成或校验。 */
  idempotencyKey: string
}

export type Phase1AppendAttemptRequest =
  | (Phase1AppendAttemptBase & {
    kind: 'automatic_retry'
    approvalBasis: 'covered_by_original_approval'
  })
  | (Phase1AppendAttemptBase & {
    kind: 'manual_reshoot'
    approvalBasis: 'current_authenticated_message'
    messageId: string
  })
  | (Phase1AppendAttemptBase & {
    kind: 'continue_shooting'
    approvalBasis: 'current_authenticated_message'
    messageId: string
  })

export const PHASE1_AUTOMATIC_RETRY_APPROVAL_BASIS = 'covered_by_original_approval' as const

/** 批次/位等新事实放在旧 strict 表不会扫描的独立根目录；开放 JSON 容器中的版本化 turn 数据除外。 */
export const PHASE1_PERSISTENCE_ROOT = 'data/agent-beta/phase1-photo-delivery' as const
export const PHASE1_PERSISTENCE_AREAS = {
  batchManifests: 'batches',
  batchSummaries: 'batch-summaries',
  slotAdmissionEvidence: 'slot-admission-evidence',
  slotExecutionLedger: 'slot-execution-ledger',
  projectState: 'project-state',
  pendingPlans: 'pending-plans',
} as const

/** 新项目流的鉴权补拉响应；currentRuns是当前事实投影，不是完整历史。 */
export interface Phase1ProjectEventReadResult {
  enabled: boolean
  cursor?: string
  frames: Phase1ProjectEventStreamFrame[]
  currentRuns: Array<{
    runId: string
    latestSequence: number
    updatedAt: string
    events: import('./run-timeline').AgentRunEvent[]
  }>
}
