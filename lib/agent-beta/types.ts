import type {
  FashionImageRatio,
  FashionModelId,
  FashionResolution,
  FeatureType,
  TaskStatus,
} from '@/lib/types'
import type { OutfitBoard, OutfitEditContext } from '@/lib/agent/outfit'

/** Beta 只编排现有服饰生图；业务图片始终使用平台的 assetId。 */
export interface AgentBetaSettings {
  /** 用户在 Composer 显式选择的输出张数；旧请求或 Agent 自动张数时缺省。 */
  resultCount?: number
  /** Agent 模式比例保持「自动」时为 true，允许 Pi 按需求或参考图决定比例。 */
  imageRatioAuto?: boolean
  referenceSearchMode?: import('@/lib/agent/outfit-reference').ReferenceSearchMode
  quality?: import('../grsai-image-options').ImageQuality
  model: FashionModelId
  imageRatio: Exclude<FashionImageRatio, 'more'>
  resolution: FashionResolution
  /** 历史请求兼容；当前界面不暴露规划 LLM，缺省由服务端配置决定。 */
  plannerLlm?: string
}

/** agent 进入多轮模型主循环；direct 执行用户明确提交的通用生图。 */
export type AgentBetaExecutionMode = 'agent' | 'direct'

/** Transport receipt only: never part of the frozen message input/fingerprint. */
export interface AgentBetaMessageReceipt {
  version: 'message-receipt-v1'
  projectId: string
  clientMessageId: string
  state: 'accepted' | 'settled'
  runId: string
  turnOutcome?: import('@/lib/agent/phase1-photo-delivery-contract').Phase1TurnOutcome
}
export type AgentBetaMessageStatus = AgentBetaMessageReceipt | {
  version: 'message-receipt-v1'; projectId: string; clientMessageId: string; state: 'not_found'
}

export type AgentBetaPlanProtocol = 'legacy' | 'agent-runtime-v1'

/** C9 工具轨迹的浏览器安全投影；不包含参数、凭据、原始异常或 A2 请求。 */
export interface AgentBetaToolTraceView {
  step: number
  toolName: string
  status: 'rejected' | 'completed' | 'awaiting_approval' | 'verification_required'
  target?: 'read_only' | 'preview' | 'gateway'
  reason?: string
}

/** 素材摘要只展示当前会话成员身份，不下发 assetDigest 或底层 URL。 */
export interface AgentBetaPreviewAssetView {
  nodeId: string
  assetId: string
  name: string
}

/** C4 PreviewArtifact 的安全浏览器投影；完整 normalizedParams 只留在服务端工件仓储。 */
export interface AgentBetaPreviewView {
  schemaVersion: 1
  proposalId: string
  version: number
  /** 服务端计算的完整 requestDigest 引用；客户端只原样回传，绝不自行计算。 */
  digest: string
  featureType: FeatureType
  toolName: string
  resolvedModelId: string
  skillId?: string
  skillName?: string
  estimatedResultCount: number
  assets: AgentBetaPreviewAssetView[]
  blockers: string[]
  riskNotices: string[]
  createdAt: string
  expiresAt: string
  confirmable: boolean
}

export type AgentBetaResultAdmissionState =
  | 'not_submitted'
  | 'pending'
  | 'verifying'
  | 'admitted'
  | 'quarantined'

/** 任务状态与结果发布分离；只有 admitted 的节点才会由服务端加入画布。 */
export interface AgentBetaResultAdmissionView {
  state: AgentBetaResultAdmissionState
  taskId?: string
  taskStatus?: TaskStatus
  /** 仅统计本 action 经 C8 返回的安全结果，不从 task aggregate 推导。 */
  resultCount?: number
}

/** 浏览器确认只绑定曾看到的服务端版本；不携带批准回执或完整参数。 */
export interface AgentBetaPreviewIdentity {
  proposalId: string
  previewVersion: number
  previewDigest: string
}

export interface AgentBetaConfirmInput extends AgentBetaPreviewIdentity {
  messageId: string
}

export interface AgentBetaRepreviewInput extends AgentBetaPreviewIdentity {
  messageId: string
  prompt: string
}

export interface AgentBetaNode {
  /** 仅服务端从真实检索旁账投影；不改变历史节点或拍摄快照。 */
  referenceKind?: import('@/lib/agent/outfit-reference').ReferenceSearchMode
  shooting?: import('@/lib/agent/shooting').ShootingOutputBinding
  /** 店铺模特参考与当季服装素材分离；历史节点缺省仍按普通上传解释。 */
  sourceRole?: 'model' | 'style' | 'reference'
  id: string
  assetId: string
  name: string
  url: string
  width: number
  height: number
  x: number
  y: number
  taskId?: string
  parentNodeId?: string
}

export interface AgentBetaPlan {
  outputSlots?: import('@/lib/agent/retry').AgentImageOutputSlot[]
  id: string
  prompt: string
  referenceNodeIds: string[]
  settings: AgentBetaSettings
  status: 'proposed' | 'submitted'
  /** 旧持久记录可缺省；新写入始终显式标记，禁止随 flag 降级已有 v1 方案。 */
  protocol?: AgentBetaPlanProtocol
  executionMode?: 'autonomous' | 'direct'
  /** 新方案写入；历史缺省按 ai-fashion-photo 解释，禁止把旧服装方案改成通用。 */
  featureType?: FeatureType
  skillId?: string | null
  skillVersion?: string | null
  preview?: AgentBetaPreviewView
  toolTrace?: AgentBetaToolTraceView[]
  resultAdmission?: AgentBetaResultAdmissionView
  task?: {
    taskId: string
    status: TaskStatus
    progress: number
    message: string
  }
}

export interface AgentBetaMessage {
  failure?: import('@/lib/v2/chat-error').ChatError
  generationStopped?: boolean
  retryOf?: import('@/lib/agent/retry').AgentRetryTarget
  clarification?: import('@/lib/agent/clarification').Clarification
  clarificationQuestions?: import('@/lib/agent/clarification').ClarificationQuestionSpec[]
  clarificationResponse?: import('@/lib/agent/clarification').ClarificationContext
  /** Durable cold-start fact; does not authorize resuming the model. */
  interrupted?: boolean
  /** 本轮实际看图后的商品锁定描述；不以文件名或上传成功冒充分析。 */
  referenceAnalysis?: string
  /** 理解中止且尚无工具执行时允许用户重新提交。 */
  retryable?: boolean
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  referenceNodeIds: string[]
  /** 无付费预览的只读/治理动作也可返回安全轨迹。 */
  toolTrace?: AgentBetaToolTraceView[]
  plan?: AgentBetaPlan
  /** 需要用户补充的具体问题；仅展示，不授予执行权限。 */
  questions?: string[]
  /** 缺省的历史消息全部必答；新版仅列出不可跳过的问题索引。 */
  requiredQuestionIndexes?: number[]
  /** 原图组成的搭配建议，不是付费生图结果。 */
  outfitBoards?: OutfitBoard[]
  /** 新版自动出片的服务端事实摘要；旧消息缺省。 */
  planSummary?: import('@/lib/agent/phase1-photo-delivery-contract').Phase1PlanSummaryFields
  /** 本轮需求只能在工作台完成时的工具入口；地址由服务端注册表生成，旧消息缺省。 */
  workbenchRoute?: import('@/lib/agent/workbench-routes').WorkbenchRouteHandoff
  /** 只在最终消息落盘时写入；即使事件写入失败也能恢复本轮结束事实。 */
  turnOutcome?: import('@/lib/agent/phase1-photo-delivery-contract').Phase1TurnOutcome
  /** 处理这条消息的运行时版本；只有新运行时写入，历史消息缺省即旧运行时。 */
  runtime?: import('@/lib/agent-pi/types').PiRuntimeVersion
  /** 新运行时本轮提交的动作及其真实状态；每次读取会话时由服务端重新投影。 */
  piSkillsRead?: string[]
  piRun?: import('@/lib/agent-pi/types').PiRunView
  piImagePlan?: import('@/lib/agent-pi/image-plan').PiImagePlan
}

export interface AgentBetaSession {
  /** 新项目首批上传冻结的主推策略投影；旧项目缺省并沿用选中原图语义。 */
  primaryGarment?: {
    version: 'phase1-primary-v1'
    revision: number
    assetIds: string[]
    selectionRequired: boolean
  }
  /** 阶段 1 新批次的唯一输出位状态；只有 admitted 分支携带鉴权图片引用。 */
  photoSlots?: import('@/lib/agent/phase1-photo-delivery-contract').Phase1PhotoSlotView[]
  /** 终态批次的持久摘要；runId 严格绑定原提交 assistant message。 */
  photoBatchSummaries?: Array<{
    batchId: string
    runId: string
    revision: number
    counts: import('@/lib/agent/phase1-photo-delivery-contract').Phase1BatchSummaryCounts
  }>
  shootings?: import('@/lib/agent/shooting').StudioShootingView[]
  canvas?: import('./canvas-presentation').CanvasPresentation
  id: string
  title: string
  createdAt: string
  updatedAt: string
  nodes: AgentBetaNode[]
  messages: AgentBetaMessage[]
  /** 旧会话文件读取兼容；C13 HTTP 响应始终补为 1。 */
  protocolVersion?: 1
  /** 只说明下一条新提案的路由，不改变会话内已有方案的协议。 */
  newProposalRuntime?: AgentBetaPlanProtocol | import('@/lib/agent-pi/types').PiRuntimeVersion
}

export type AgentBetaSessionSummary = Pick<AgentBetaSession, 'id' | 'title' | 'updatedAt'>

/** Agent 画布首页“最近项目”仅展示当前用户的 Agent 会话。 */
export interface AgentBetaRecentProjectSummary {
  id: string
  title: string
  updatedAt: string
  kind: 'session'
  sessionId: string
  /**
   * 首页封面：优先画布上最近一张已通过结果准入的成图，否则最近一张上传素材。
   * 始终是当前用户资产的现行 fileUrl（非 data:）；任何一项核验存疑即省略，旧客户端忽略即可。
   */
  coverUrl?: string
}

export interface AgentBetaMessageInput {
  /** 由 V2 画布服务在受理前冻结新请求的运行时。历史请求缺省。 */
  agentRuntime?: import('@/lib/agent-pi/types').PiRuntimeVersion
  imagePlanConfirmation?: import('@/lib/agent-pi/image-plan').PiImagePlanTarget
  retryOutput?: import('@/lib/agent/retry').AgentRetryTarget
  clarificationResponse?: import('@/lib/agent/clarification').ClarificationResponse
  shooting?: import('@/lib/agent/shooting').ShootingRequest
  clientMessageId: string
  text: string
  /** 另出一版或执行已商定下一步时，服务端从来源轮次继承的任务目标。 */
  followUpGoal?: string
  followUpOperation?: 'variation' | 'advance'
  /** 用户在输入框提交的原始短词（不含系统追加的保真句与项目参考块），供直出关键词查表精准匹配。 */
  rawUserText?: string
  /** 首页/工具页「做同款」隐式携带的案例 ID；仅在服务端查询私有配方，不对客户端暴露长提示词。 */
  caseId?: string
  referenceNodeIds: string[]
  settings: AgentBetaSettings
  /** 缺省保持现有 Agent 行为；直接生图必须由用户显式选择。 */
  executionMode?: AgentBetaExecutionMode
  wardrobeNodeIds?: string[]
  outfitEdit?: OutfitEditContext
  /** 仅用于用户明确重试冻结拍摄失败位；服务端复核当前会话任务与输出位。 */
  retryTaskId?: string
  /** 新版批次原位重拍；当前尝试号用于拒绝陈旧入口，归属与资格由服务端复核。 */
  manualReshoot?: { failureOnly?: true; batchId: string; slotId: string; expectedAttemptNumber: number }
}

/** 客户端发送上下文；引用仍由消息 API 校验当前会话归属。 */
export type AgentBetaSendContext = Pick<AgentBetaMessageInput, 'outfitEdit' | 'wardrobeNodeIds' | 'shooting' | 'retryTaskId' | 'manualReshoot'> & {
  referenceNodeIds?: string[]
}

export interface AgentBetaAccess {
  allowed: boolean
  enabled: boolean
  localOnly: boolean
}
