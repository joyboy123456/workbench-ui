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

export interface Material {
  id: ID
  name: string
  image: ImageRef
  /** 'upload' 用户上传 | 'saved' 从生成结果存入 | 'clip' 网页收藏 */
  origin: 'upload' | 'saved' | 'clip'
  createdAt: string
}

export type GenerationKind = 'main' | 'detail' | 'model' | 'banner' | 'video' | 'edit'

export interface Generation {
  id: ID
  projectId: ID
  image: ImageRef
  kind: GenerationKind
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
  /** running 时 0–100 */
  progress?: number
}

export interface Project {
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
  x: number
  y: number
  /** 画布上显示宽度；高度按 targetSize（缺省为 image）比例算 */
  w: number
  /** 真实创建时间；旧画布缺省时保持原顺序，不从 ID 推测。 */
  createdAt?: string
  /** 模特拖入仍沿用原素材 ref；此字段仅供布局分类，不授予资源归属。 */
  assetKind?: 'model'
  /** 分类整理后的标题归属；不是父节点，不参与生成溯源。 */
  layoutSection?: CanvasCategory
  locked?: boolean
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
  retryAllowed?: boolean
  startedAt?: string
  /** 本次引用的商品图，仅作生成占位底图 */
  placeholder?: ImageRef
}

export type ArrangeMode = 'grid' | 'masonry' | 'category' | 'time'

/* ---------------- 对话 ---------------- */

export type AgentMode = 'agent' | 'ecom-set' | 'direct'

export interface ChatAttachment {
  kind: 'product' | 'model' | 'canvas' | 'material' | 'upload' | 'brand'
  id: ID
  label: string
  image: ImageRef
}

export interface UserMessage {
  id: ID
  role: 'user'
  text: string
  attachments: ChatAttachment[]
  createdAt: string
}

export interface AssistantStep {
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
  /** 规格行，如 "3:4 · 1536×2048 · Nano Banana 2" */
  spec?: string
  /** 「这一版落实的几点」列表 */
  highlights?: string[]
  /** 「常见调整方向」可点 chip */
  suggestions?: string[]
}

export interface AssistantMessage {
  id: ID
  role: 'assistant'
  steps: AssistantStep[]
  /** 本轮产出的图（缩略图行） */
  results: { id: ID; image?: ImageRef; status: Generation['status'] }[]
  /** 正文：markdown 子集（段落、无序列表） */
  body?: string
  /** 正在流式输出 */
  streaming?: boolean
  /** 出图结果结构化信息 */
  meta?: AssistantResultMeta
  createdAt: string
}

export interface AskOption {
  key: string
  label: string
  description?: string
}

export interface AskMessage {
  id: ID
  role: 'ask'
  /** 遇到歧义时先说一句原因 */
  reason?: string
  /** 问题标题 */
  question: string
  /** 单选选项 A / B / C */
  options: AskOption[]
  /** D 其他输入框占位文案 */
  otherPlaceholder?: string
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
  progress: number
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

/** 首页「做同款」案例。接线：来自案例库（lib/clothing-cases.ts 的 listClothingCases / getClothingCasePreviews） */
export interface CaseExample {
  id: ID
  title: string
  image: ImageRef
  /** 案例分类（用于首页案例区筛选） */
  category?: 'model' | 'main' | 'detail' | 'style'
  /** 瀑布流展示比例提示 */
  aspect?: 'tall' | 'square' | 'wide'
  /** 做同款时用到的工具；缺省走 Agent */
  toolId?: string
  /** 做同款时预填的提示词 */
  prompt?: string
}

export interface Account {
  name: string
  avatar?: string
  credits: number
}

/* ---------------- AI 工具广场 ---------------- */

export type ToolCategoryId = 'model' | 'detail' | 'style' | 'retouch' | 'fabric' | 'util'

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
}
