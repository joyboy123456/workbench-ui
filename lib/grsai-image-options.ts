import { isGptImage26 } from './openai-image-models'

export const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ImageQuality = typeof IMAGE_QUALITIES[number]
export const IMAGE_QUALITY_LABELS: Record<ImageQuality, string> = {
  auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高',
}

/** Grsai 官方参数；画质和像素尺寸是两个独立设置。 */
export function grsaiQualityOptions(model: string): readonly ImageQuality[] {
  if (model === 'gpt-image-2.5-sunburst') return ['low', 'medium', 'high', 'xhigh', 'max', 'auto']
  if (model === 'gpt-image-2.5-flare') return ['low', 'medium', 'high', 'auto']
  if (model === 'gpt-image-2.5') return ['auto']
  return []
}

export function imageQualityOptions(model: string): readonly ImageQuality[] {
  return isGptImage26(model) ? IMAGE_QUALITIES : grsaiQualityOptions(model)
}

export function readImageQuality(value: unknown, model: string): ImageQuality | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !imageQualityOptions(model).includes(value as ImageQuality)) throw new Error('画质不受当前模型支持')
  return value as ImageQuality
}

const GPT_IMAGE_PIXEL_SIZE_TABLE: Record<string, Record<'1K' | '2K' | '4K', string>> = {
  '9:16': { '1K': '576x1024', '2K': '1152x2048', '4K': '2160x3840' },
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '3:2': { '1K': '1536x1024', '2K': '2048x1360', '4K': '3520x2336' },
  '2:3': { '1K': '1024x1536', '2K': '1360x2048', '4K': '2336x3520' },
  '3:4': { '1K': '768x1024', '2K': '1536x2048', '4K': '2480x3312' },
  '4:3': { '1K': '1024x768', '2K': '2048x1536', '4K': '3312x2480' },
}

export function grsaiGptImageDimensions(ratio: string, resolution: string): string {
  const size = resolution.toUpperCase()
  const tier = size === '1K' || size === '4K' ? size : '2K'
  return (GPT_IMAGE_PIXEL_SIZE_TABLE[ratio] ?? GPT_IMAGE_PIXEL_SIZE_TABLE['1:1'])[tier]
}
