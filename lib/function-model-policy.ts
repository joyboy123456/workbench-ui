import catalog from './clothing-tool-catalog.json'
import { CLOTHING_FIXED_MODELS, DETAIL_PAGE_MODEL_RULES, TEXTILE_OBLIQUE_MODEL } from './clothing-model-rules'
import { SELECTABLE_FASHION_MODELS, type FashionModelId } from './types'
import type { ClothingToolSpec } from './clothing-tool-compiler'
import { V2_IMAGE_OP_TOOL_IDS, isV2ImageOpToolId, type V2ImageOpToolId } from './v2-image-ops'
import { HOME_TEXTILE_CAMERAS } from './textile-tools'
import { GPT_IMAGE_26 } from './openai-image-models'

export interface FunctionModelPolicy {
  toolId: number
  name: string
  mode: 'fixed' | 'user-choice' | 'tier' | 'context' | 'text' | 'external' | 'unavailable'
  defaultModel?: string
  variants?: Readonly<Record<string, string>>
  referenceVariants?: Readonly<Record<string, string>>
}

/** 单一功能目录：固定模型复用公开规则，非生图/用户选型显式保留自身语义。 */
const CATALOG_FUNCTION_MODEL_POLICIES: readonly FunctionModelPolicy[] = catalog.map(tool => ({
  toolId: tool.id, name: tool.name,
  mode: tool.stage === 'preview' ? 'unavailable' : tool.id === 80244 ? 'external'
    : [80263, 80264].includes(tool.id) ? 'text'
      : [701, 705, 706, 80212, 80213].includes(tool.id) ? 'user-choice'
        : [707, 80232].includes(tool.id) ? 'tier' : tool.id === 80303 ? 'context' : 'fixed',
  ...(![80263, 80264].includes(tool.id) && CLOTHING_FIXED_MODELS[tool.id]
    ? { defaultModel: CLOTHING_FIXED_MODELS[tool.id] } : {}),
  ...(tool.id === 80232 ? { variants: DETAIL_PAGE_MODEL_RULES } : {}),
  ...(tool.id === 80303 ? { variants: { oblique: TEXTILE_OBLIQUE_MODEL, default: CLOTHING_FIXED_MODELS[80303] } } : {}),
  ...([701, 705, 706, 707, 709].includes(tool.id) ? { referenceVariants: {
    PRO: 'gemini-3-pro-image-preview', BASE: 'doubao-seedream-5-0-PRO',
    'gpt-image-2': 'gpt-image-2', 'material-enhanced': 'banana-pro-material-enhanced',
  } } : {}),
}))

/**
 * V2 画布图像操作（任务卡 06）：AI扩图 80246 / 蒙版局部修改 80247 / 蒙版消除 80248 / 2K放大 80249。
 * 只注册在代码里、不进 clothing-tool-catalog.json——老工作台侧栏直接消费该目录，
 * 追加条目会改变 /workbench 展示；此处追加保证 resolveClothingFunctionModel 能解析固定模型。
 */
export const V2_IMAGE_OP_TOOL_NAMES: Readonly<Record<V2ImageOpToolId, string>> = {
  80246: 'AI扩图',
  80247: '蒙版局部修改',
  80248: '蒙版智能消除',
  80249: '高清放大2K',
  80250: '改文字', 80251: '移动位置', 80252: '多角度', 80253: 'GIF 动图', 80254: '实物效果',
}

const V2_IMAGE_OP_POLICIES: readonly FunctionModelPolicy[] = V2_IMAGE_OP_TOOL_IDS.map(toolId => ({
  toolId,
  name: V2_IMAGE_OP_TOOL_NAMES[toolId],
  mode: 'fixed' as const,
  defaultModel: CLOTHING_FIXED_MODELS[toolId],
}))

export const FUNCTION_MODEL_POLICIES: readonly FunctionModelPolicy[] = [
  ...CATALOG_FUNCTION_MODEL_POLICIES,
  ...V2_IMAGE_OP_POLICIES,
]


export const CURRENT_TOOL_MODELS = SELECTABLE_FASHION_MODELS.filter(model => ['nano-banana-2.1', 'nano-banana-pro', GPT_IMAGE_26.sunburst, GPT_IMAGE_26.flare].includes(model.id))

export function readToolModelChoice(value: unknown, toolId: number): FashionModelId | undefined {
  if (value === undefined) return undefined
  const policy = FUNCTION_MODEL_POLICIES.find(item => item.toolId === toolId)
  if (!policy || ['text', 'external', 'unavailable'].includes(policy.mode) || [80232, 80242].includes(toolId) || isV2ImageOpToolId(toolId)) throw new Error('此功能不支持自选模型')
  const model = CURRENT_TOOL_MODELS.find(item => item.id === value)
  if (toolId === 80245 && value !== GPT_IMAGE_26.sunburst && value !== GPT_IMAGE_26.flare) throw new Error('转矢量仅支持GPT Image 2.6')
  if (!model) throw new Error('请选择当前已接入的模型档位')
  return model.id
}

/** 所有专项工具的实际选模统一经过功能目录；不改历史已冻结任务。 */
export function resolveClothingFunctionModel(spec: ClothingToolSpec, selected?: unknown): FashionModelId {
  const policy = FUNCTION_MODEL_POLICIES.find(item => item.toolId === spec.toolId)
  if (!policy || ['unavailable', 'external'].includes(policy.mode)) throw new Error('此功能缺少可执行模型策略')
  const choice = readToolModelChoice(spec.generationModel, spec.toolId)
  if (choice) return choice
  if (spec.toolId === 80213 && selected !== undefined) {
    const model = SELECTABLE_FASHION_MODELS.find(item => item.id === selected && item.maxInputImages >= 2)
    if (!model) throw new Error('参考改款不支持所选模型')
    return model.id
  }
  if (spec.toolId === 80232) return DETAIL_PAGE_MODEL_RULES[spec.detailModel ?? 'PRO']
  if (spec.textileWorkflow) return spec.textileWorkflow === 'color-reference' ? GPT_IMAGE_26.sunburst : 'nano-banana-pro'
  if (spec.toolId === 80303) {
    const index = (spec.variantIndex ?? 1) - 1
    const camera = spec.cameraViews?.[index] ?? HOME_TEXTILE_CAMERAS[index]?.id
    if (spec.textileMode === 'camera' && ['45_degree_overhead', '45_degree_flat'].includes(camera)) return TEXTILE_OBLIQUE_MODEL
  }
  // V2 扩图对齐椒图允许显式选模型：枚举已在 imageOpSchema 校验，仅限已接入 Grsai 渠道映射的型号。
  if (spec.toolId === 80246 && spec.v2ImageOp?.op === 'outpaint' && spec.v2ImageOp.model) return spec.v2ImageOp.model
  // 默认规则与策略目录共用同一配置；旧业务默认值保持已验收口径，可显式选择新档。
  const model = CLOTHING_FIXED_MODELS[spec.toolId]
  if (!model) throw new Error('此功能缺少模型策略')
  return model
}
