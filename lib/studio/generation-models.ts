import { isAgentImageModel, DEFAULT_FASHION_MODEL, SELECTABLE_FASHION_MODELS, type FashionModelId } from '@/lib/types'
import { imageQualityOptions } from '@/lib/grsai-image-options'
import type { AgentBetaSettings } from '@/lib/agent-beta/types'

export const STUDIO_GENERATION_MODELS = SELECTABLE_FASHION_MODELS.filter(isAgentImageModel)

/** 上身图是默认交付：沿用 3:4 竖幅与 2K 清晰度；完整主图需用户显式选择其他比例或模型。 */
export const STUDIO_DEFAULT_MODEL: FashionModelId = DEFAULT_FASHION_MODEL
export function studioDefaultSettings(): AgentBetaSettings {
  return { referenceSearchMode: 'shop', model: STUDIO_DEFAULT_MODEL, imageRatio: '3:4', resolution: '2k' }
}

/** API 只能收紧产品允许的模型范围；未知或停用的模型不会成为选项。 */
export function availableStudioGenerationModels(modelIds: readonly string[]) {
  const available = new Set(modelIds)
  return STUDIO_GENERATION_MODELS.filter(model => available.has(model.id))
}

export function initialAvailableGenerationModel(current: FashionModelId, modelIds: readonly string[]): FashionModelId {
  const models = availableStudioGenerationModels(modelIds)
  return models.find(model => model.id === current)?.id ?? models.find(model => model.id === 'nano-banana-2.1')?.id
    ?? models.find(model => model.id === 'nano-banana-2')?.id ?? models[0]?.id ?? current
}

/** 仅用于下次发送的编辑设置；历史计划/任务继续使用冻结参数。 */
export function generationSettingsForModel(settings: AgentBetaSettings, model: FashionModelId): AgentBetaSettings {
  const next = { ...settings, model }
  const metadata = STUDIO_GENERATION_MODELS.find(item => item.id === model)
  if (metadata && Number.parseInt(next.resolution, 10) > Number.parseInt(metadata.maxResolutionLabel, 10)) next.resolution = '1k'
  const qualities = imageQualityOptions(model)
  if (!qualities.length) delete next.quality
  else if (!next.quality || !qualities.includes(next.quality)) next.quality = qualities.includes('high') ? 'high' : qualities[0]
  return next
}
