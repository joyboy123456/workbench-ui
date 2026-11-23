import { isAgentImageModel, DEFAULT_FASHION_MODEL, SELECTABLE_FASHION_MODELS, type FashionModelId } from '@/lib/types'

export const STUDIO_GENERATION_MODELS = SELECTABLE_FASHION_MODELS.filter(isAgentImageModel)

export const STUDIO_DEFAULT_MODEL: FashionModelId = DEFAULT_FASHION_MODEL
