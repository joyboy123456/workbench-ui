import { FASHION_IMAGE_RATIOS, FASHION_RESOLUTIONS, STUDIO_GENERATION_MODELS, STUDIO_DEFAULT_MODEL } from './model-presets'

export interface ComposerGeneration {
  modelId: string
  ratio: string
  resolution: string
  count: number
}
export interface ComposerModel {
  id: string
  name: string
  description: string
  recommended: boolean
  resolutions: string[]
}
export interface ComposerOptions {
  models: ComposerModel[]
  ratios: string[]
  resolutions: string[]
  directMaxCount: number
}
export const COMPOSER_PREFERENCES_KEY = 'v2:composer-preferences:v1'
export const defaultGeneration: ComposerGeneration = { modelId: STUDIO_DEFAULT_MODEL, ratio: '3:4', resolution: '2k', count: 4 }

/** Same registry as 05; API supplies the configured availability set, mock supplies all. */
export function composerOptions(modelIds: readonly string[] = STUDIO_GENERATION_MODELS.map(model => model.id), directMaxCount = 8): ComposerOptions {
  const resolutions = FASHION_RESOLUTIONS.map(item => item.id)
  return {
    models: STUDIO_GENERATION_MODELS.filter(model => modelIds.includes(model.id)).map((model, index) => ({
      id: model.id, name: model.label, description: model.description,
      recommended: index === 0 || model.id === STUDIO_DEFAULT_MODEL || model.id === 'nano-banana-2.1',
      resolutions: resolutions.filter(value => parseInt(value, 10) <= parseInt(model.maxResolutionLabel, 10)),
    })),
    ratios: FASHION_IMAGE_RATIOS.filter(item => item.id !== 'more').map(item => item.id),
    resolutions, directMaxCount,
  }
}
export function normalizeGeneration(value: Partial<ComposerGeneration>, options: ComposerOptions): ComposerGeneration {
  const model = options.models.find(item => item.id === value.modelId) ?? options.models[0]
  const resolutions = model?.resolutions ?? options.resolutions
  return {
    modelId: model?.id ?? '',
    ratio: options.ratios.includes(value.ratio ?? '') ? value.ratio! : '3:4',
    resolution: resolutions.includes(value.resolution ?? '') ? value.resolution! : resolutions[0] ?? '1k',
    count: Number.isInteger(value.count) && value.count! >= 1 && value.count! <= 8 ? value.count! : 4,
  }
}
