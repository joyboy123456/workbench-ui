import type { CanvasItem, ToolDef } from './types'
import { itemHeight } from './arrange'

const common = ['upscale', 'outpaint', 'cutout', 'erase', 'inpaint']
const labels: Record<string, string> = { upscale: '超清放大', outpaint: 'AI扩图', cutout: '一键抠图', erase: '智能消除', inpaint: '局部修改' }

export const singleToolbarIds = ['outpaint', 'upscale', 'describe', 'erase', 'inpaint', 'text-edit', 'cutout', 'layer-split', 'move-obj']
export const multiToolbarIds = ['fuse', 'upscale', 'describe', 'move-obj', 'cutout']
export function canvasToolbarTools(tools: ToolDef[], multi = false) {
  return (multi ? multiToolbarIds : singleToolbarIds).flatMap(id => tools.filter(t => t.id === id && t.surfaces.includes(multi && id === 'fuse' ? 'batch' : 'selection')))
    .map(t => ({ ...t, name: labels[t.id] ?? t.name }))
}

export const unavailableCanvasTool = (tool: ToolDef) => ['text-edit', 'layer-split', 'move-obj', 'fuse'].includes(tool.id)
  ? '即将上线，当前尚未接入处理能力' : undefined

/** The directory remains authoritative: no fallback resurrects a hidden tool.
 * Editors and tools with no runnable mapping stay out of the action menus. */
export function selectionTools(tools: ToolDef[]) {
  const ready = tools.filter(t => t.surfaces.includes('selection') && !t.editor && (t.backendToolId !== undefined || t.id === 'outpaint'))
    .map(t => ({ ...t, name: labels[t.id] ?? t.name }))
  return {
    common: common.flatMap(id => ready.filter(t => t.id === id)),
    more: ready.filter(t => !common.includes(t.id)),
  }
}

export const usableImage = (item: CanvasItem) => item.status !== 'running' && item.status !== 'failed' && Boolean(item.image.url)

/** Copy media/layout, never a live job's recovery identity or failed state. */
export function pasteCanvasItems(copied: CanvasItem[], existing: CanvasItem[], newId: () => string, at?: { x: number; y: number }): CanvasItem[] {
  const sources = copied.filter(usableImage)
  if (!sources.length) return []
  const left = Math.min(...sources.map(i => i.x))
  const top = Math.min(...sources.map(i => i.y))
  const right = Math.max(...existing.map(i => i.x + i.w), ...sources.map(i => i.x + i.w))
  const origin = at ?? { x: right + 48, y: top }
  return sources.map(i => ({
    id: newId(), ref: structuredClone(i.ref), image: structuredClone(i.image),
    x: origin.x + i.x - left, y: origin.y + i.y - top, w: i.w,
    ...(i.parentId ? { parentId: i.parentId } : {}),
    status: 'done',
  }))
}

/** Array order is the layer order; preserve the relative order of moved nodes. */
export type LayerOrder = 'front' | 'up' | 'down' | 'back'
export function reorderCanvasItems(items: CanvasItem[], ids: string[], order: boolean | LayerOrder) {
  const selected = new Set(ids)
  const moving = items.filter(i => selected.has(i.id))
  const rest = items.filter(i => !selected.has(i.id))
  if (order === true || order === 'front') return [...rest, ...moving]
  if (order === false || order === 'back') return [...moving, ...rest]
  const next = [...items]
  if (order === 'up') {
    for (let i = next.length - 2; i >= 0; i--) if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]
  } else {
    for (let i = 1; i < next.length; i++) if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]
  }
  return next
}

export function selectionBounds(items: CanvasItem[]) {
  return {
    x: Math.min(...items.map(i => i.x)), y: Math.min(...items.map(i => i.y)),
    right: Math.max(...items.map(i => i.x + i.w)), bottom: Math.max(...items.map(i => i.y + itemHeight(i))),
  }
}
