import { STUDIO_GENERATION_MODELS } from './model-presets'
import type { AssistantMessage, Generation, ImageRef } from './types'

type Size = Pick<ImageRef, 'width' | 'height'>
const validSize = (size?: Size): size is Size => Boolean(size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0)
export const imageDimensions = (size?: Size) => validSize(size) ? `${size.width} × ${size.height}` : '尺寸未记录'
const COMMON_RATIOS = [[1, 1], [3, 4], [4, 3], [2, 3], [3, 2], [4, 5], [5, 4], [9, 16], [16, 9], [2, 1], [1, 2], [3, 1], [1, 3], [21, 9]] as const
export function imageRatio(size?: Size): string {
  if (!validSize(size)) return '未记录'
  const ratio = size.width / size.height
  const nearest = COMMON_RATIOS.reduce((best, pair) => Math.abs(Math.log(ratio / (pair[0] / pair[1]))) < Math.abs(Math.log(ratio / (best[0] / best[1]))) ? pair : best)
  const error = Math.abs(ratio / (nearest[0] / nearest[1]) - 1)
  if (error < .01) return nearest.join(':')
  let a = Math.round(size.width), b = Math.round(size.height)
  const width = a, height = b
  while (b) { const remainder = a % b; a = b; b = remainder }
  if (a > 0 && Math.max(width / a, height / a) <= 32) return `${width / a}:${height / a}`
  return `≈ ${nearest.join(':')}`
}
const dimensionPart = /^(?:\d+(?:\.\d+)?\s*[:×x]\s*\d+(?:\.\d+)?)(?:\s*(?:px|像素))?$/i
/** Per-image chips own source dimensions; batch text must not repeat frozen target pixels. */
export function generationSpecSummary(spec?: string): string {
  return (spec ?? '').split('·').map(part => part.trim()).filter(part => part && !dimensionPart.test(part)).join(' · ')
}
export function generationMetadata(generation?: Partial<Generation>, message?: AssistantMessage) {
  const p = generation?.params
  const spec = generationSpecSummary(message?.meta?.spec)
  const specModel = spec.split(' · ').find(part => part && !/^\d+(?:\.\d+)?k$/i.test(part))
  const string = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined
  const recordedModel = string(generation?.modelName) ?? string(p?.modelName) ?? string(p?.model) ?? string(p?.modelId) ?? message?.meta?.modelName ?? specModel
  const modelName = STUDIO_GENERATION_MODELS.find(model => model.id === recordedModel)?.label ?? recordedModel
  const positive = (value: unknown) => {
    const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
    return Number.isSafeInteger(n) && n > 0 ? n : undefined
  }
  const outputCount = positive(generation?.outputCount) ?? positive(p?.resultCount) ?? positive(p?.n) ?? positive(p?.outputCount)
    ?? positive(message?.meta?.outputCount) ?? positive(message?.results.length)
  return { modelName, outputCount }
}
