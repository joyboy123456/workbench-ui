import type { CanvasItem, ImageRef, ToolParams } from './types'

export interface GenerationDisplay {
  attempt: string
  label: string
  percent?: number
  estimated: boolean
  slow: boolean
}

/** Conservative initial timing estimates; tune with observed tool latency later. */
export function toolDurationMs(toolId = ''): number {
  const base = toolId.split(':')[0]
  return ({ upscale: 30_000, erase: 35_000, inpaint: 45_000, outpaint: 45_000, 'detail-page': 75_000 }[base] ?? 60_000)
}

export function generationDisplay(item: CanvasItem, now: number, previous?: GenerationDisplay): GenerationDisplay {
  const attempt = `${item.id}:${item.toolRunId ?? ''}:${item.startedAt ?? ''}`
  const base = { attempt, estimated: false, slow: false }
  if (item.status === 'done') return { ...base, label: '已完成', percent: 100 }
  if (item.status === 'failed') return { ...base, label: '生成失败' }
  if (item.generationPhase === 'unconfirmed') return { ...base, label: '状态待确认' }
  if (item.generationPhase === 'queued') return { ...base, label: '排队中' }
  const started = Date.parse(item.startedAt ?? '')
  const elapsed = Number.isFinite(started) ? Math.max(0, now - started) : 0
  const duration = item.estimatedDurationMs ?? toolDurationMs()
  const slow = elapsed > Math.max(60_000, duration * 1.5)
  const reported = item.progress !== undefined && Number.isFinite(item.progress) && item.progress > 0
  const estimate = 5 + 90 * (1 - Math.exp(-elapsed / duration * 1.8))
  const value = reported ? item.progress! : estimate
  const floor = previous?.attempt === attempt ? previous.percent ?? 0 : 0
  const percent = Math.min(95, Math.max(floor, Math.floor(value), 0))
  // A lower provider sample must not relabel our retained estimate as measured.
  const estimated = !reported || floor > value && previous?.estimated === true
  return { attempt, estimated, slow, percent,
    label: item.generationPhase === 'processing' ? '处理中' : `生成中 ${percent}%` }
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
  if (typeof ratio !== 'string' || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) return { width, height }
  const [a, b] = ratio.split(':').map(Number)
  if (!a || !b) return { width, height }
  if (base === 'outpaint') {
    const multiple = Math.ceil(Math.max(width / a, height / b))
    return { width: a * multiple, height: b * multiple }
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
