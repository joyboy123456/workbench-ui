import type { GarmentVisualEvidence } from './garment-visual-evidence'

/** 画布搭配使用原始素材；这些记录不是生成图，也不是 C8 准入凭证。 */
export const GARMENT_CATEGORIES = ['outerwear', 'top', 'bottom', 'dress', 'shoes', 'bag', 'hat', 'accessory', 'model', 'other', 'unknown'] as const
export type GarmentCategory = typeof GARMENT_CATEGORIES[number]
export const GARMENT_FITS = ['unknown', 'slim', 'regular', 'loose', 'oversized'] as const
export const GARMENT_LENGTHS = ['unknown', 'cropped', 'regular', 'long'] as const
export const GARMENT_PATTERNS = ['unknown', 'solid', 'subtle', 'complex'] as const
export const GARMENT_LAYERING = ['unknown', 'inner', 'outer_open', 'outer_closed', 'none'] as const

const OUTFIT_REQUEST_PATTERN = /搭配|穿搭|混搭|配一套|搭一套|怎么搭|怎么配/
const TEXT_PRIMARY_DECLARATION = /(?:是|作为|当作|用作|选作|设为|定为)(?:本次)?(?:主推|主打|重点商品|重点款|核心款)|以.+为(?:本次)?(?:主推|主打|重点商品|重点款|核心款)|(?:主推(?:商品|款)?|主打款|重点商品|重点款|核心款)\s*(?:是|用|选|定为|作为)\s*.+/

/** 只识别搭配业务意图，不从颜色、品类或文件名猜素材身份。 */
export function isOutfitRequestText(text: string): boolean {
  return OUTFIT_REQUEST_PATTERN.test(text)
}

/** 用户原话同时明确要求搭配并声明主推；具体素材仍须经搜索、看图和服务端范围校验。 */
export function requestsTextResolvedPrimary(text: string): boolean {
  return isOutfitRequestText(text) && text.split(/[，。；！？!?\n]/u)
    .some(clause => !/(?:哪|哪个|什么)/u.test(clause) && TEXT_PRIMARY_DECLARATION.test(clause))
}
export interface GarmentFeatures {
  fit: typeof GARMENT_FITS[number]
  length: typeof GARMENT_LENGTHS[number]
  pattern: typeof GARMENT_PATTERNS[number]
  layering: typeof GARMENT_LAYERING[number]
}
export const GARMENT_CATEGORY_LABELS: Record<GarmentCategory, string> = {
  outerwear: '外套', top: '内搭／上衣', bottom: '裤子／下装', dress: '裙装', shoes: '鞋', bag: '包',
  hat: '帽子', accessory: '配饰', model: '模特', other: '其他', unknown: '待确认',
}

export interface GarmentDescription {
  category: GarmentCategory
  colors: string[]
  description: string
  confidence: number
  /** 旧识别缓存允许缺省；未知外观不得根据文件名补造。 */
  features?: GarmentFeatures
  /** 新识别的像素观察；缺省不补造，不能代替实际来源或用户目标。 */
  visualEvidence?: GarmentVisualEvidence
}

export interface WardrobeItem extends GarmentDescription {
  assetId: string
  nodeId: string
  name: string
  status: 'queued' | 'analyzing' | 'ready' | 'failed'
  categorySource: 'vision' | 'user' | 'unknown'
}

export interface WardrobeView {
  enabled: boolean
  processing: boolean
  items: WardrobeItem[]
}

export const OUTFIT_ROLES = ['primary', 'outerwear', 'top', 'bottom', 'dress', 'shoes', 'bag', 'hat', 'accessory'] as const
export type OutfitRole = typeof OUTFIT_ROLES[number]
export const OUTFIT_ROLE_LABELS: Record<OutfitRole, string> = {
  primary: '主推商品', outerwear: '外套', top: '内搭／上衣', bottom: '裤子／下装', dress: '裙装',
  shoes: '鞋', bag: '包', hat: '帽子', accessory: '配饰',
}

export interface OutfitPiece {
  role: OutfitRole
  assetId: string
  reason: string
}

export interface OutfitStyleReference {
  id: string
  title: string
  anchors: string[]
  sourceVersion?: number
  /** 验收案例的冻结版本；不是当前项目素材或生图参考。 */
  acceptedCase?: { caseId: string; sourceRevision: string }
}

export interface OutfitAcceptedCase {
  id: string
  title: string
  anchors: string[]
  garmentCategory: GarmentCategory
  colors: string[]
  fit: GarmentFeatures['fit']
  source: {
    taskId: string
    resultAssetId: string
    inputAssetIds: string[]
    kind: 'whole_outfit_reference' | 'individual_garments'
    acceptanceVerifiedAt: string
  }
}

/** 服务端私有案例目录；归属和来源不直接投影给模型。 */
export interface OutfitAcceptedCases {
  ownerUserId: string
  sourceRevision: string
  cases: OutfitAcceptedCase[]
}

/** 本地报告中的搭配方向；只提供创作依据，不表示偏好概率或生成授权。 */
export interface OutfitRecipeReference {
  recipeId: string
  name: string
  sourceRevision: string
  evidenceStatus: 'checked' | 'unchecked' | 'missing' | 'questionable'
}

export interface OutfitRecipeGuide extends OutfitRecipeReference {
  applicability: string[]
  slotPreferences: Array<{ role: OutfitRole; features: string[] }>
  exceptions: string[]
  cautions: string[]
}

export interface OutfitRecipeCatalog {
  status: 'available' | 'unavailable' | 'disabled'
  recipes: OutfitRecipeGuide[]
  limitations: string[]
  acceptedCases?: OutfitAcceptedCases
}

/** 只保存素材引用；浏览器从当前已鉴权画布节点取得图片地址。 */
export interface OutfitBoard {
  primaryDetailAssetIds?: string[]
  lookReference?: import('./outfit-reference').OutfitLookReference
  genericAccompaniments?: import('./accompaniment-catalog').GenericAccompaniment[]
  id: string
  revision: number
  title: string
  rationale: string
  primaryAssetId: string
  pieces: OutfitPiece[]
  styleReferences: OutfitStyleReference[]
  /** 仅保存本轮实际读到的公式引用；旧搭配板允许缺省。 */
  recipeReferences?: OutfitRecipeReference[]
  createdAt: string
}

/** 用户从某套搭配发起微调；版本和可修改部位由界面随本次请求提交。 */
export interface OutfitEditContext {
  boardId: string
  revision: number
  editableRoles: Exclude<OutfitRole, 'primary'>[]
}

/** 服务端冻结本轮可读取的衣服范围；分类和模型选择不能扩大这个范围。 */
export interface OutfitTurnContext {
  mainImagePlanning?: 'main-image-v1'
  deliveryKind?: 'main_image' | 'photo' | 'other'
  referenceSearchMode?: import('./outfit-reference').ReferenceSearchMode
  primaryDetailAssetIds?: string[]
  sourcePolicy?: 'search-or-provided-v1'
  /** 用户本轮实际选图顺序，用于核对「图一/图二」；不按画布坐标重排。 */
  inputImageAssetIds?: string[]
  /** 理解后由服务端核验；未明确提供搭配依据时默认 search。 */
  sourceMode?: 'search' | 'provided'
  sourceBindings?: import('./outfit-reference').OutfitSourcePlan['bindings']
  providedModelAssetId?: string
  providedLookAssetIds?: string[]
  accompanimentPolicy?: 'generic-kids-v1'
  selectedModelAssetId?: string
  /** 仅新 turn 冻结；缺省继续使用原 Jev 请求与排序，旧记录不升级。 */
  evaluationVersion?: 'jev-outfit-v2'
  /** 只在新轮冻结；旧轮读取新缓存也不改变原 Jev 请求。 */
  visualEvidenceVersion?: 'garment-visual-evidence-v1'
  /** 新出片规则允许最多10套；历史缺省仍按5套校验。 */
  proposalLimit?: 10
  primaryAssetIds: string[]
  allowedAssetIds: string[]
  previousBoards: OutfitBoard[]
  edit?: OutfitEditContext
  /** 从本轮显式引用的已准入成片恢复，仅用于明确要求单张新版的微调；模型不能填写。 */
  editShooting?: {
    sourceNodeId: string
    outputSlotId: string
    snapshot: import('./shooting').ShootingSnapshot
  }
  /**
   * 新请求未显式引用服装，但本轮原话明确声明了主推。模型只能从当前项目范围搜索并看图后选出唯一主推；
   * 该标记不代表 allowedAssetIds 都是主推，也不兼容微调或非空 primaryAssetIds。
   */
  resolvePrimaryFromText?: true
  /** 原话声明了主推，但当前项目识别未能唯一绑定；本轮只能要求用户选中原图。 */
  primarySelectionRequired?: true
  /** 主推由本轮文字和当前项目衣橱唯一匹配；仍须在提案前看原图。 */
  textPrimaryBound?: true
  /** 随本次请求冻结；恢复或后续工具读取不得改用更新后的报告版本。 */
  recipeCatalog?: OutfitRecipeCatalog
  /**
   * 主推商品的衣橱识别文字（视觉推断或用户纠正），随本次请求冻结；是弱信号，不是像素或控制事实。
   * 选中素材都有识别文字时理解阶段不再附图。旧冻结输入缺省。
   */
  primaryRecognition?: OutfitPrimaryRecognition[]
}

export interface OutfitPrimaryRecognition extends GarmentDescription {
  assetId: string
  categorySource: 'vision' | 'user'
}
