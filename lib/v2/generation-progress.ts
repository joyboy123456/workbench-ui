import { defaultOutpaintImageSize, outpaintRatioTarget } from '@/lib/v2-image-ops'
import type { CanvasItem, ImageRef, ToolParams } from './types'

export interface GenerationDisplay {
  label: string
}

/** Retained for persisted task metadata; the UI never derives progress from it. */
export function toolDurationMs(toolId = ''): number {
  const base = toolId.split(':')[0]
  return ({ upscale: 30_000, erase: 35_000, inpaint: 45_000, outpaint: 45_000, 'detail-page': 75_000 }[base] ?? 60_000)
}

/** Only lifecycle facts are displayed. Completion comes from the task status. */
export function generationDisplay(item: Pick<CanvasItem, 'status' | 'generationPhase'>): GenerationDisplay {
  if (item.status === 'done') return { label: '已完成' }
  if (item.status === 'failed') return { label: '生成失败' }
  if (item.generationPhase === 'unconfirmed') return { label: '状态待确认' }
  if (item.generationPhase === 'queued') return { label: '排队中' }
  if (item.generationPhase === 'processing') return { label: '处理中' }
  return { label: '生成中' }
}

/** Expand/crop ratios are targets, not inferred from the eventual bitmap. */
export function generationTarget(source: Pick<ImageRef, 'width' | 'height'>, toolId = '', params: ToolParams = {}) {
  const width = Math.max(1, source.width), height = Math.max(1, source.height)
  const base = toolId.split(':')[0]
  if (base === 'upscale') {
    // Existing tool IDs name resolution tiers, not a fixed pixel multiplier.
    const scale = (toolId.endsWith(':4x') ? 4096 : 2048) / Math.max(width, height)
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
  }
  if (base === 'outpaint' && ['padTop', 'padRight', 'padBottom', 'padLeft'].some(key => params[key] !== undefined)) {
    const pad = (key: string, side: number) => Math.round(side * Math.max(0, Number(params[key]) || 0) / 100)
    return { width: width + pad('padLeft', width) + pad('padRight', width), height: height + pad('padTop', height) + pad('padBottom', height) }
  }
  const ratio = base === 'detail-page' ? '3:4' : params.ratio ?? (base === 'outpaint' ? '1:1' : undefined)
  const aspect = base === 'outpaint' && ratio === 'original' ? `${width}:${height}` : ratio
  if (typeof aspect !== 'string' || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(aspect)) return { width, height }
  const [a, b] = aspect.split(':').map(Number)
  if (!a || !b) return { width, height }
  if (base === 'outpaint') {
    const tier = params.imageSize === '1K' || params.imageSize === '2K' || params.imageSize === '4K'
      ? params.imageSize : defaultOutpaintImageSize(width, height)
    return outpaintRatioTarget(a, b, tier)
  }
  return { width, height: Math.max(1, Math.round(width * b / a)) }
}

/** Updates carry lifecycle only; preserve local placement and a frozen frame. */
export function mergeGenerationItem(item: CanvasItem, patch: Partial<CanvasItem>): CanvasItem {
  const sameAttempt = (!patch.startedAt || patch.startedAt === item.startedAt) && (!patch.toolRunId || patch.toolRunId === item.toolRunId)
  const progress = sameAttempt
    ? patch.progress === undefined ? item.progress : Math.max(item.progress ?? 0, patch.progress)
    : patch.progress
  return { ...item, ...patch, progress, targetSize: item.targetSize ?? patch.targetSize }
}
