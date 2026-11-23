import { itemHeight } from './arrange'
import { selectionBounds } from './selection-actions'
import type { CanvasItem } from './types'

export type CornerHandle = 'nw' | 'ne' | 'sw' | 'se'
export type EdgeHandle = 'n' | 's' | 'e' | 'w'
export type ResizeHandle = CornerHandle | EdgeHandle

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
export type DistributeMode = 'distribute-x' | 'distribute-y'
export type CanvasAlignAction = AlignMode | DistributeMode

export const MIN_CANVAS_ITEM_SIZE = 24

export interface ResizePatch {
  x: number
  y: number
  w: number
  h?: number
}

export function resizeCanvasItem(
  origin: CanvasItem,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize = MIN_CANVAS_ITEM_SIZE,
): ResizePatch {
  const x0 = origin.x
  const y0 = origin.y
  const w0 = Math.max(1, origin.w)
  const h0 = itemHeight(origin)
  const right0 = x0 + w0
  const bottom0 = y0 + h0

  if (handle === 'e' || handle === 'w' || handle === 'n' || handle === 's') {
    if (handle === 'e') return { x: x0, y: y0, w: Math.max(minSize, Math.round(w0 + dx)), h: h0 }
    if (handle === 'w') {
      const w = Math.max(minSize, Math.round(w0 - dx))
      return { x: right0 - w, y: y0, w, h: h0 }
    }
    if (handle === 's') return { x: x0, y: y0, w: w0, h: Math.max(minSize, Math.round(h0 + dy)) }
    const h = Math.max(minSize, Math.round(h0 - dy))
    return { x: x0, y: bottom0 - h, w: w0, h }
  }

  const sx = handle.includes('e') ? 1 : -1
  const sy = handle.includes('s') ? 1 : -1
  const scaleX = (w0 + sx * dx) / w0
  const scaleY = (h0 + sy * dy) / h0
  const rawScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
  const minScale = Math.max(minSize / w0, minSize / h0)
  const scale = Math.max(minScale, rawScale)
  const w = Math.max(minSize, Math.round(w0 * scale))
  const hasCustomHeight = origin.h !== undefined
  const nextH = hasCustomHeight
    ? Math.max(minSize, Math.round((w * h0) / w0))
    : itemHeight({ ...origin, w, h: undefined })
  const x = sx < 0 ? right0 - w : x0
  const y = sy < 0 ? bottom0 - nextH : y0
  return hasCustomHeight ? { x, y, w, h: nextH } : { x, y, w }
}

export function applyResizePatch(items: CanvasItem[], id: string, patch: ResizePatch): CanvasItem[] {
  return items.map(item => {
    if (item.id !== id) return item
    if (patch.h === undefined) {
      if (item.x === patch.x && item.y === patch.y && item.w === patch.w && item.h === undefined) return item
      const { h: _drop, ...rest } = item
      return { ...rest, x: patch.x, y: patch.y, w: patch.w }
    }
    if (item.x === patch.x && item.y === patch.y && item.w === patch.w && item.h === patch.h) return item
    return { ...item, x: patch.x, y: patch.y, w: patch.w, h: patch.h }
  })
}

export function nudgeCanvasItems(items: CanvasItem[], ids: readonly string[], dx: number, dy: number): CanvasItem[] {
  if ((dx === 0 && dy === 0) || !ids.length) return items
  const selected = new Set(ids)
  let changed = false
  const next = items.map(item => {
    if (!selected.has(item.id) || item.locked) return item
    changed = true
    return { ...item, x: item.x + dx, y: item.y + dy }
  })
  return changed ? next : items
}

export function alignCanvasItems(items: CanvasItem[], ids: readonly string[], mode: AlignMode): CanvasItem[] {
  const selectedSet = new Set(ids)
  const selected = items.filter(item => selectedSet.has(item.id))
  if (selected.length < 2) return items
  const bounds = selectionBounds(selected)
  const centerX = (bounds.x + bounds.right) / 2
  const centerY = (bounds.y + bounds.bottom) / 2
  let changed = false
  const next = items.map(item => {
    if (!selectedSet.has(item.id) || item.locked) return item
    let x = item.x
    let y = item.y
    if (mode === 'left') x = bounds.x
    else if (mode === 'center-x') x = Math.round(centerX - item.w / 2)
    else if (mode === 'right') x = Math.round(bounds.right - item.w)
    else if (mode === 'top') y = bounds.y
    else if (mode === 'center-y') y = Math.round(centerY - itemHeight(item) / 2)
    else if (mode === 'bottom') y = Math.round(bounds.bottom - itemHeight(item))
    if (x === item.x && y === item.y) return item
    changed = true
    return { ...item, x, y }
  })
  return changed ? next : items
}

export function distributeCanvasItems(items: CanvasItem[], ids: readonly string[], mode: DistributeMode): CanvasItem[] {
  const selectedSet = new Set(ids)
  const indexed = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => selectedSet.has(item.id))
  if (indexed.length < 3) return items

  const horizontal = mode === 'distribute-x'
  const sorted = [...indexed].sort((a, b) =>
    horizontal
      ? a.item.x - b.item.x || a.item.y - b.item.y || a.index - b.index
      : a.item.y - b.item.y || a.item.x - b.item.x || a.index - b.index,
  )

  const first = sorted[0].item
  const last = sorted[sorted.length - 1].item
  const sizeOf = (item: CanvasItem) => (horizontal ? item.w : itemHeight(item))
  const startOf = (item: CanvasItem) => (horizontal ? item.x : item.y)
  const span = startOf(last) + sizeOf(last) - startOf(first)
  const totalSize = sorted.reduce((sum, entry) => sum + sizeOf(entry.item), 0)
  const gap = (span - totalSize) / (sorted.length - 1)

  const positions = new Map<string, number>()
  let cursor = startOf(first) + sizeOf(first) + gap
  for (let i = 1; i < sorted.length - 1; i++) {
    const entry = sorted[i].item
    if (!entry.locked) positions.set(entry.id, Math.round(cursor))
    cursor += sizeOf(entry) + gap
  }

  let changed = false
  const next = items.map(item => {
    const target = positions.get(item.id)
    if (target === undefined) return item
    if (horizontal) {
      if (target === item.x) return item
      changed = true
      return { ...item, x: target }
    }
    if (target === item.y) return item
    changed = true
    return { ...item, y: target }
  })
  return changed ? next : items
}

export function applyCanvasAlignAction(items: CanvasItem[], ids: readonly string[], action: CanvasAlignAction): CanvasItem[] {
  return action === 'distribute-x' || action === 'distribute-y'
    ? distributeCanvasItems(items, ids, action)
    : alignCanvasItems(items, ids, action)
}
