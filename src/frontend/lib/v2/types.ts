/**
 * V2 前端（画布铺满 + 资产库）的数据模型。
 * 这里只描述前端需要的形状；接线时由 data-source 的真实实现把后端数据映射成这些类型。
 */

export type ID = string

/** 一张图（商品图、模特图、生成结果都用它） */
export interface ImageRef {
  id: ID
  url: string
  width: number
  height: number
  /** 小图，列表与对话缩略图用；缺省时用 url */
  thumbUrl?: string
  /** 外部案例的原图，只用于登记账号素材；展示用 url / thumbUrl。 */
  sourceUrl?: string
}

/** 商品类目是开放的：服装、鞋包、家电、3C……由用户自建 */
export interface ProductCategory {
  id: ID
  name: string
  count: number
}

export interface Product {
  id: ID
  name: string
  categoryId: ID
  /** 多角度商品图，第一张为封面 */
  images: ImageRef[]
  /** 卖点、材质、尺寸等，Agent 写文案和详情页用 */
  notes?: string
  /** 已生成的图片张数 */
  generatedCount: number
  /** 用到它的项目 */
  projectIds: ID[]
  createdAt: string
  updatedAt: string
}

export interface FashionModel {
  id: ID
  name: string
  cover: ImageRef
  tags: string[]
  /** 'preset' 平台模特 | 'custom' 店铺自建 */
  source: 'preset' | 'custom'
}

export interface BrandKit {
  id: ID
  name: string
  logo?: ImageRef
  colors: string[]
  fonts: string[]
  references: ImageRef[]
  guidance?: string
}

/** Sendable account-library references, separately from the browsable preset catalogue. */
export interface ComposerReferences {
  models: FashionModel[]
  brandKits: BrandKit[]
}

export interface MaterialCategory {
  id: ID
  name: string
  count: number
  createdAt: string
}

export interface Material {
  id: ID
  name: string
  image: ImageRef
  /** 'upload' 用户上传 | 'saved' 从生成结果存入 | 'clip' 网页收藏 */
  origin: 'upload' | 'saved' | 'clip'
  categoryId?: ID
  deletedAt?: string
  createdAt: string
}

export interface PromptPreset {
  id: ID
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

/** 项目参考只保存账号资产身份，不复制图片。 */
export const PROJECT_REFERENCE_SOURCES = ['product', 'material', 'upload', 'generation'] as const
export type ProjectReferenceSource = (typeof PROJECT_REFERENCE_SOURCES)[number]

export const PROJECT_REFERENCE_ROLES = ['product_lock', 'model_lock', 'style', 'pose', 'scene', 'other'] as const
export type ProjectReferenceRole = (typeof PROJECT_REFERENCE_ROLES)[number]
export type ProjectReferenceRoleSource = 'auto' | 'user'

export interface ProjectReference {
  id: ID
  projectId: ID
  source: ProjectReferenceSource
  sourceId: ID
  assetId: ID
  role: ProjectReferenceRole
  note: string
  roleSource: ProjectReferenceRoleSource
  enabled: boolean
  sort: number
  createdAt: string
  updatedAt: string
  /** 资产被删除或不再准入时省略，记录仍可由用户删除。 */
  image?: ImageRef
}

/** 一次真实生成所冻结的参考顺序。图片编号按此数组从 1 开始。 */
export interface AppliedProjectReference {
  referenceId?: ID
  assetId: ID
  role: ProjectReferenceRole
  note: string
  explicit: boolean
}

export interface ProjectReferencePlan {
  references: AppliedProjectReference[]
  referencePlan: string
  droppedReferenceIds: ID[]
}

export interface FrozenProjectReferencePlan extends ProjectReferencePlan {
  version: 'project-references-v1'
  projectId: ID
  /** 位于 references 开头、由图片工具自身契约要求的输入数量。 */
  functionalInputCount: number
}

export type GenerationKind = 'main' | 'detail' | 'model' | 'banner' | 'video' | 'edit'

export interface Generation {
  mode?: AgentMode
  generation?: import('./composer-options').ComposerGeneration
  id: ID
  projectId: ID
  image: ImageRef
  kind: GenerationKind
  /** 视频结果：封面用 image，播放与下载用 video */
  video?: import('./video-options').VideoMedia
  /** 用到的商品与模特，用于溯源与筛选 */
  productIds: ID[]
  modelId?: ID
  /** 由哪张图派生而来（扩图、换姿势等），只存档，画布默认不连线 */
  parentId?: ID
  parentIds?: ID[]
  toolRunId?: string
  toolId?: string
  prompt?: string
  createdAt: string
  status: 'done' | 'running' | 'failed'
  /** History metadata is projected from owned, admitted task outputs. */
  source?: 'tool' | 'agent'
  taskId?: ID
  runId?: ID
  assetId?: ID
  favorite?: boolean
  modelName?: string
  ratio?: string
  resolution?: string
  outputCount?: number
  params?: ToolParams
  attachments?: ChatAttachment[]
  /** running 时 0–100 */
  progress?: number
  elapsedMs?: number
  errorMessage?: string
  retryAllowed?: boolean
}

export interface Project {
  nameSource?: 'automatic' | 'manual'
  id: ID
  name: string
  cover?: ImageRef
  /** 用户指定的封面节点；自动保存仍保留此选择 */
  coverItemId?: ID
  productIds: ID[]
  updatedAt: string
}

/* ---------------- 画布 ---------------- */

export type CanvasCategory = 'product' | 'model' | 'generation' | 'material'

/** 画布上的一个元素。坐标是画布世界坐标，图片按原像素 × 统一缩放落位 */
export interface CanvasItem {
  id: ID
  /** 指向 Generation 或 Product 图片或 Material */
  ref:
    | { type: 'generation'; id: ID }
    | { type: 'product'; id: ID; imageId: ID }
    | { type: 'material'; id: ID }
  image: ImageRef
  /** 视频节点：image 是封面帧，播放与下载用 video */
  mediaType?: 'video'
  video?: import('./video-options').VideoMedia
  x: number
  y: number
  /** 画布上显示宽度；高度优先取 h，缺省按 targetSize（或 image）比例算 */
  w: number
  /** 可选画布显示高度（四边拖拽改画幅时写入）；缺省按原比例推导 */
  h?: number
  /** 真实创建时间；旧画布缺省时保持原顺序，不从 ID 推测。 */
  createdAt?: string
  /** 模特拖入仍沿用原素材 ref；此字段仅供布局分类，不授予资源归属。 */
  assetKind?: 'model'
  /** 分类整理后的标题归属；不是父节点，不参与生成溯源。 */
  layoutSection?: CanvasCategory
  locked?: boolean
  /** 用户明确锁定当前图片分辨率；与位置锁独立。 */
  resolutionLocked?: boolean
  /** 尺寸输入是否保持当前图片的宽高比，缺省开启。 */
  aspectRatioLocked?: boolean
  /** 旧版单来源，读取时作为 parentIds 的兼容回退。不是画布分组。 */
  parentId?: ID
  /** 来源画布元素 ID，按主图、参考图排序；默认不画连线。 */
  parentIds?: ID[]
  status?: Generation['status']
  progress?: number
  /** Tool lifecycle metadata. No client field grants task or media ownership. */
  generationPhase?: 'queued' | 'generating' | 'processing' | 'unconfirmed'
  /** Frozen output frame; actual image metadata remains authoritative on completion. */
  targetSize?: { width: number; height: number }
  /** Tool-specific estimate, never a completion/admission signal. */
  estimatedDurationMs?: number
  toolRunId?: string
  errorMessage?: string
  agentRetry?: import('@/lib/agent/retry').AgentRetryTarget
  agentOrigin?: { runId: string; taskId: string; slotId: string; slotIndex: number; attemptNumber: number }
  retryAllowed?: boolean
  startedAt?: string
  /** 本次引用的商品图，仅作生成占位底图 */
  placeholder?: ImageRef
}

export type ArrangeMode = 'grid' | 'masonry' | 'category' | 'time'

/* ---------------- 对话 ---------------- */

export type AgentMode = 'agent' | 'image' | 'video' | 'ecom-set'

export interface ChatAttachmentMask {
  assetId?: ID
  url: string
  type: 'brush'
}

export interface ChatAttachment {
  kind: 'product' | 'model' | 'canvas' | 'material' | 'upload' | 'brand'
  id: ID
  label: string
  image: ImageRef
  mask?: ChatAttachmentMask
}

export interface UserMessage {
  appliedReferences?: ChatAttachment[]
  clarificationResponse?: import('@/lib/agent/clarification').ClarificationContext
  mode?: AgentMode
  generation?: import('./composer-options').ComposerGeneration
  threadId?: string
  contents?: import('./structured-input').StructuredContentBlock[]
  id: ID
  role: 'user'
  text: string
  attachments: ChatAttachment[]
  createdAt: string
}

export interface AssistantStep {
  streamStepId?: string
  /** Stable output identity: chat and canvas share its lifecycle display. */
  itemId?: ID
  /** 灰色状态行，如「思考完成」「AI 商品主图」 */
  label: string
  icon: 'think' | 'image' | 'doc' | 'tool'
  /** 进行中或已完成状态 */
  status?: 'running' | 'done' | 'failed'
  /** 思考完成等可折叠步骤的详情内容 */
  detail?: string
  /** 是否允许折叠展开 */
  collapsible?: boolean
  /** 生成中显示 3 / 6 之类 */
  progress?: { done: number; total: number }
}

export interface AssistantResultMeta {
  risks?: string[]
  modelName?: string
  outputCount?: number
  /** 本次实际采用参考的简短中文说明。 */
  referencePlan?: string
  /** 因十张上限未采用的项目参考 ID。 */
  droppedReferenceIds?: ID[]
  /** 规格行，如 "3:4 · 1536×2048 · Nano Banana 2" */
  spec?: string
  /** 「这一版落实的几点」列表 */
  highlights?: string[]
  /** 「常见调整方向」可点 chip */
  suggestions?: string[]
}

export interface AssistantMessage {
  canInspectRun?: boolean
  imagePlan?: import('@/lib/agent-pi/image-plan').PiImagePlanView
  failure?: import('./chat-error').ChatError
  retryable?: boolean
  id: ID
  role: 'assistant'
  /** Agent 首轮回复时给出的简短项目标题 */
  title?: string
  steps: AssistantStep[]
  /** 本轮产出的图（缩略图行） */
  results: {
    id: ID
    image?: ImageRef
    /** 视频结果：卡片封面 + 点击播放 */
    video?: import('./video-options').VideoMedia
    status: Generation['status']
    itemId?: ID
    ratio?: string
    targetSize?: { width: number; height: number }
    progress?: number
    generationPhase?: CanvasItem['generationPhase']
  }[]
  /** 正文：markdown 子集（段落、无序列表） */
  body?: string
  /** 流式内容块（对齐 Lovart 5 类内容块：text / tool_use / tool_result / tool_event / image） */
  blocks?: import('./agent-stream-handler').AgentContentBlock[]
  threadId?: string
  queueState?: import('./agent-stream-handler').AgentQueueState
  quotaPause?: import('./agent-stream-handler').AgentQuotaPauseState
  /** 正在流式输出 */
  streaming?: boolean
  /** Real SSE bypasses the snapshot-only typing fallback. */
  textSource?: 'sse' | 'snapshot'
  /** 出图结果结构化信息 */
  meta?: AssistantResultMeta
  createdAt: string
}

export interface AskOption {
  key: string
  label: string
  description?: string
}

/** 一道澄清题（Lovart ask_user：mode single/multiple，末尾总有「其它」输入） */
export interface AskQuestion {
  question: string
  mode?: 'single' | 'multiple'
  options: AskOption[]
  otherPlaceholder?: string
}

export interface AskMessage {
  clarification?: import('@/lib/agent/clarification').Clarification
  id: ID
  role: 'ask'
  /** Agent 首轮回复时给出的简短项目标题 */
  title?: string
  /** 遇到歧义时先说一句原因 */
  reason?: string
  /** 问题标题 */
  question: string
  /** 单选选项 A / B / C */
  options: AskOption[]
  /** D 其他输入框占位文案 */
  otherPlaceholder?: string
  /** 多题（Lovart 一张卡最多若干题翻页）；缺省时用 question/options 当一题 */
  questions?: AskQuestion[]
  /** 已回答状态 */
  answered?: { selectedKey: string; answerText: string }
  /** 已跳过状态 */
  skipped?: boolean
  createdAt: string
}

export type ChatMessage = UserMessage | AssistantMessage | AskMessage

export interface ActiveTask {
  id: ID
  projectId: ID
  projectName: string
  title: string
  phase: 'queued' | 'generating' | 'processing' | 'unconfirmed'
  thumbUrl?: string
  ratio?: string
  startedAt: string
}

/* ---------------- 工具 ---------------- */

export interface ToolDef {
  id: string
  name: string
  /** 在哪里出现 */
  surfaces: ('home' | 'selection' | 'batch' | 'slash')[]
  icon: string
  /** 主操作，在选中工具条上用白底按钮 */
  primary?: boolean
  /** 低频工具：在选中工具条里收进「更多」 */
  more?: boolean
  /** 子选项（如放大倍率）；运行时 toolId 传 `${id}:${option.id}` */
  options?: { id: string; label: string; hint?: string }[]
  /** 需要在画布上手动操作的编辑器（裁剪、调色、文字、移动），不走生成 */
  editor?: boolean
  /** 接线：对应 lib/clothing-tool-catalog.json 的工具 id；缺省表示后端还没有，需要新做。详见 docs/v2-canvas-tools.md */
  backendToolId?: number
  /** 参数面板字段；有字段的工具点击后先弹面板（画布右侧），再生成 */
  fields?: ToolField[]
  /** 画布叠层：mask = 画笔涂抹；frame-out = 扩图目标框；frame-in = 裁剪框；filter = 调色实时预览 */
  overlay?: 'mask' | 'frame-out' | 'frame-in' | 'filter'
  /** 每张消耗积分（占位，接线后由计费接口给） */
  cost?: number
  /** 面板说明一句话 */
  tip?: string
}

/**
 * 参数面板字段。控件按选项数选：2 → segment；≤5 → segment/chips 平铺；6–10 → select；>10 → select + 搜索。
 * 多选（姿势、机位）≤8 用 chips，>8 用 select（多选 + 搜索）。
 */
export interface ToolField {
  id: string
  label: string
  kind: 'segment' | 'chips' | 'select' | 'text' | 'ref' | 'slider'
  options?: { id: string; label: string; hint?: string }[]
  multi?: boolean
  default?: string | string[] | number
  placeholder?: string
  optional?: boolean
  min?: number
  max?: number
  /** 这个字段决定出图张数（多选的选项数或数字） */
  count?: boolean
  /** 只给 ratio 用：选项 id 形如 '3:4'，用来驱动画布叠层 */
  ratio?: boolean
}

export type ToolParams = Record<string, string | string[] | number | ImageRef | undefined>

/** 案例分类：首页案例区 tab。retouch = 修图改图，fabric = 图案面料 / 家纺 */
export type CaseCategory = 'model' | 'main' | 'detail' | 'style' | 'retouch' | 'fabric'

/** 案例参考图（做同款时的原始输入示意） */
export interface CaseReference extends ImageRef {
  label?: string
}

/** 首页「做同款」案例。接线：来自服务端案例库（lib/server/v2/case-library.ts，只用自有案例） */
export interface CaseExample {
  id: ID
  title: string
  /** url = 详情大图（仅详情打开时加载）；thumbUrl = 卡片缩略图；sourceUrl = 原图，只用于做同款登记素材 */
  image: ImageRef
  video?: { url: string; duration: number }
  /** 案例分类（用于首页案例区筛选） */
  category?: CaseCategory
  /** 案例日期（YYYY-MM-DD）；案例库默认按它新到旧排序，月份筛选也基于它 */
  date?: string
  /** 瀑布流展示比例提示 */
  aspect?: 'tall' | 'square' | 'wide'
  /** 做同款时用到的工具；缺省走 Agent */
  toolId?: string
  /** 工具名，卡片与详情展示 */
  toolName?: string
  /** 案例短标题指令（如「做同款：xxx」） */
  keyword: string
  /** 案例完整提示词：首页「做同款」原样带入图像模式输入框，用户可改 */
  prompt?: string
  /** 建议用户上传的自身商品/参考图角色说明 */
  inputHint?: string[]
  /** 案例的参考输入图 */
  references?: CaseReference[]
  /** 公开画面规格摘要（不含内部模型路由与渠道配比） */
  meta?: { aspectRatio?: string; resolution?: string }
}

export interface CaseQuery {
  category?: CaseCategory
  toolId?: string
  /** 月份（YYYY-MM，如 2026-11） */
  month?: string
  limit?: number
  offset?: number
}

export interface CaseFacets {
  /** 各分类案例数（不受分类筛选影响） */
  categories: { id: CaseCategory; count: number }[]
  /** 当前分类下有案例的工具，按数量倒序 */
  tools: { id: string; name: string; count: number }[]
  /** 各月份案例数（YYYY-MM，新到旧；不受月份筛选影响） */
  months: { id: string; count: number }[]
}

export interface CasePage {
  cases: CaseExample[]
  total: number
  /** 下一页 offset；没有更多时为 null */
  nextOffset: number | null
  facets: CaseFacets
}

export interface Account {
  name: string
  avatar?: string
  credits: number
}

/* ---------------- AI 工具广场 ---------------- */

export type ToolCategoryId = 'model' | 'detail' | 'style' | 'retouch' | 'fabric' | 'video' | 'util'

/** 封面示意：split = 前后对比；grid/stack = 多张结果；其余为同一张图上的效果示意（原型用，接线后换真实前后图） */
export interface ToolCover {
  fx: 'split' | 'grid' | 'stack' | 'cutout' | 'blur' | 'sketch' | 'tint' | 'swatch' | 'logo' | 'mark' | 'tile' | 'text'
  before: string
  after: string
  extra?: string[]
}

export interface ToolCatalogItem {
  /** = lib/clothing-tool-catalog.json 的 id */
  id: string
  name: string
  category: ToolCategoryId
  /** 卡片上的一句话，≤16 字 */
  desc: string
  cover: ToolCover
  /** 需要准备的输入 */
  inputs: string[]
  output: string
  /** ready 可用；config 需配置凭据；soon 即将上线 */
  status: 'ready' | 'config' | 'soon'
  featured?: boolean
  /** 每张积分（占位） */
  cost?: number
  /** 该工具在案例库里的案例数 */
  caseCount?: number
}
