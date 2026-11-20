import { DETAIL_MAX_PRODUCT_IMAGES, type DetailTemplateVersion } from './product-detail'
import { resolveClothingFunctionModel } from './function-model-policy'
import { FASHION_RESOLUTIONS, SELECTABLE_FASHION_MODELS, type FashionModelId } from './types'
import { TEXTILE_TOOL_IDS, HOME_TEXTILE_MAX_INPUT_IMAGES, type TextileSettings } from './textile-tools'
import { CLOTHING_FIXED_MODELS } from './clothing-model-rules'
import { readProductionKind, readProductionRoles } from './textile-production'

import { V2_IMAGE_OP_TOOL_IDS, type V2ImageOp } from './v2-image-ops'
export * from './v2-image-ops'

/** 浏览器可见的规格，不包含生成模板；模板编译位于lib/server。 */
export const EXECUTABLE_CLOTHING_TOOL_IDS = [
  702, 709, 80213, 80215, 80216, 80217, 80231, 80232, 80239, 80240, 80242, 80243, 80262,
  80263, 80264, 80238, 80245,
  ...V2_IMAGE_OP_TOOL_IDS,
  ...TEXTILE_TOOL_IDS,
] as const

/** 文本交付工具：只跑视觉分析，不进生图通道。 */
export const IMAGE_TEXT_TOOL_IDS = [80263, 80264] as const
export type ImageTextToolId = (typeof IMAGE_TEXT_TOOL_IDS)[number]

export function isImageTextToolId(id: unknown): id is ImageTextToolId {
  return typeof id === 'number' && (IMAGE_TEXT_TOOL_IDS as readonly number[]).includes(id)
}

export const REDESIGN_MODELS = SELECTABLE_FASHION_MODELS.filter(model => model.maxInputImages >= 2)

export type RedesignModel = FashionModelId

export function readRedesignModel(value: unknown): RedesignModel {
  if (value === undefined) return CLOTHING_FIXED_MODELS[80213]
  const model = REDESIGN_MODELS.find(option => option.id === value)
  if (!model) throw new Error('参考改款不支持所选模型')
  return model.id
}

export function redesignResolutions(model: RedesignModel) {
  const limit = REDESIGN_MODELS.find(option => option.id === model)?.maxResolutionLabel
  return FASHION_RESOLUTIONS.filter(option => Number.parseInt(option.id, 10) <= Number.parseInt(limit ?? '4K', 10))
}

export type ExecutableClothingToolId = (typeof EXECUTABLE_CLOTHING_TOOL_IDS)[number]
export type RefactorMode = 'clothing' | 'environment' | 'model' | 'shoes'
export type StyleFissionBranch = '1' | '2' | '3'

export const STYLE_MIX_MAX_DESIGNS = 6

export const MOCKUP_DEFAULT_POSITION = '正面胸口居中'
export const MOCKUP_SCALE = { min: 5, max: 100, default: 30 } as const
export const MOCKUP_ROTATION = { min: -180, max: 180, default: 0 } as const

export interface ClothingToolSpec extends TextileSettings {
  version: 1
  generationModel?: FashionModelId
  toolId: ExecutableClothingToolId | 80232
  instruction?: string
  refactorMode?: RefactorMode
  element?: string
  position?: string
  fissionBranch?: StyleFissionBranch
  categoryName?: string
  designCount?: number
  modelPosition?: string
  productCategory?: string
  sellingPoints?: string
  scene?: string
  upscaleFactor?: 2 | 4
  /** 80232：商品图在前，可选模特图固定在最后。 */
  hasModel?: boolean
  detailTemplateVersion?: DetailTemplateVersion
  detailModel?: import("./product-detail").DetailModel
  sellingPointsDefaulted?: boolean
  screenCount?: number
  /** 80238：图案宽度相对于商品可见宽度的百分比。 */
  mockupScale?: number
  /** 80238：顺时针为正，逆时针为负。 */
  mockupRotation?: number
  /** 80246–80254：V2 画布图像操作判别联合（含宫格切图及 GIF）。 */
  v2ImageOp?: V2ImageOp
  /** 仅服务端冻结；区分工具固定输入与项目默认参考，并记录真实图片顺序。 */
  projectReferencePlan?: import('./v2/types').FrozenProjectReferencePlan
}

/** 前端展示与服务端归一化使用同一模型选择规则，服务端先校验完整规格。 */
export function clothingToolModel(spec: ClothingToolSpec, selectedModel?: unknown): FashionModelId {
  return resolveClothingFunctionModel(spec, selectedModel)
}

export function isExecutableClothingToolId(id: unknown): id is ExecutableClothingToolId {
  return typeof id === 'number' && (EXECUTABLE_CLOTHING_TOOL_IDS as readonly number[]).includes(id)
}

/** 客户端只预检输入；服务端仍独立校验和重建所有派生字段。 */
export function validateClothingToolInput(spec: ClothingToolSpec, count: number): void {
  const production = readProductionKind(spec.textileWorkflow, spec.toolId)
  if (production) {
    if (spec.version !== 1) throw new Error('服装工具参数无效')
    readProductionRoles(spec.textileInputRoles, count, production)
    return
  }
  const ranges: Record<ClothingToolSpec['toolId'], readonly [number, number]> = {
    702: [2, 2], 709: [2, 4], 80213: [2, 2], 80215: [1, 1],
    80216: [1, 1], 80217: [2, 10], 80231: [2, 4], 80232: [1, DETAIL_MAX_PRODUCT_IMAGES + 1],
    80238: [2, 2], 80239: [2, 2], 80240: [1, 2], 80242: [1, 1], 80243: [1, 1], 80262: [2, 4],
    80263: [1, 1], 80264: [1, 1], 80245: [1, 1],
    80246: [1, 14], 80247: [1, 2], 80248: [1, 1], 80249: [1, 1],
    80250: [1, 1], 80251: [1, 1], 80252: [1, 1], 80253: [1, 1], 80254: [1, 1],
    80301: [1, 1], 80302: [1, 1], 80303: [1, HOME_TEXTILE_MAX_INPUT_IMAGES], 80304: [1, 1], 80305: [1, 1],
  }
  const range = ranges[spec.toolId]
  if (!range || spec.version !== 1) throw new Error('服装工具参数无效')
  if (count < range[0] || count > range[1]) {
    throw new Error(`此工具需要上传 ${range[0] === range[1] ? range[0] : range.join('～')} 张图片`)
  }
}
