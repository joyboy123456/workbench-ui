import { parentIds } from './provenance'
import { usableImage } from './selection-actions'
import type { CanvasItem, ImageRef } from './types'

export interface ComparePair {
  left: CanvasItem | null
  right: CanvasItem | null
  siblings: CanvasItem[]
}

/** A deleted first source stays missing; another reference must not stand in for it. */
export const compareSourceId = (item: CanvasItem) => parentIds(item)[0] ?? null

const timestamp = (item: CanvasItem) => {
  const value = item.createdAt ? Date.parse(item.createdAt) : NaN
  return Number.isFinite(value) ? value : Infinity
}

/** A single ID compares with its first source. Two IDs explicitly pin both sides
 * in selection order, irrespective of their provenance. No snapshot is mutated. */
export function comparePair(itemId: string | readonly string[], items: readonly CanvasItem[]): ComparePair {
  const empty: ComparePair = { left: null, right: null, siblings: [] }
  if (typeof itemId !== 'string') {
    if (itemId.length !== 2 || itemId[0] === itemId[1]) return empty
    const left = items.find(item => item.id === itemId[0])
    const right = items.find(item => item.id === itemId[1])
    return left && right && usableImage(left) && usableImage(right) ? { left, right, siblings: [right] } : empty
  }

  const right = items.find(item => item.id === itemId) ?? null
  if (!right) return empty
  const sourceId = compareSourceId(right)
  if (!sourceId) return { left: null, right, siblings: usableImage(right) ? [right] : [] }

  const left = items.find(item => item.id === sourceId) ?? null
  const siblings = items.filter(item => compareSourceId(item) === sourceId && usableImage(item))
    .sort((a, b) => timestamp(a) - timestamp(b) || items.indexOf(a) - items.indexOf(b))
  return { left, right, siblings }
}

/** Resolve the exact canvas image object before ID fallbacks (copies can share media). */
export function previewItemId(image: ImageRef, items: readonly CanvasItem[], selected: readonly string[] = []) {
  return (items.find(item => item.image === image)
    ?? items.find(item => selected.includes(item.id) && item.image.id === image.id)
    ?? items.find(item => item.image.id === image.id))?.id ?? null
}

/** Stop at the ends, so repeated arrow presses cannot silently wrap the review. */
export function compareSibling(pair: ComparePair, direction: -1 | 1) {
  const index = pair.siblings.findIndex(item => item.id === pair.right?.id)
  return index < 0 ? null : pair.siblings[index + direction]?.id ?? null
}

/** pos is a horizontal offset in the same units as w; output is a CSS clip-path.
 * Using w=100 supports a percentage range without observing layout dimensions. */
export function sliderClip(pos: number, w: number): string {
  const width = Number.isFinite(w) && w > 0 ? w : 0
  const position = Number.isNaN(pos) ? 0 : Math.min(width, Math.max(0, pos))
  const hidden = width ? 100 * (1 - position / width) : 100
  return `inset(0 ${Number(hidden.toFixed(6))}% 0 0)`
}
