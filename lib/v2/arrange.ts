import type { ArrangeMode, CanvasCategory, CanvasItem } from './types'

export const itemHeight = (i: CanvasItem) => {
  const size = i.targetSize ?? i.image
  return Math.max(1, Math.round(size.width > 0 && size.height > 0 ? i.w * size.height / size.width : i.w))
}

const GAP = 14
const TITLE = 32
const SECTION_GAP = 56
export const canvasCategories: { id: CanvasCategory; label: string }[] = [
  { id: 'product', label: '商品' }, { id: 'model', label: '模特' },
  { id: 'generation', label: '结果' }, { id: 'material', label: '素材' },
]
export const itemCategory = (item: CanvasItem): CanvasCategory =>
  item.ref.type === 'material' && item.assetKind === 'model' ? 'model' : item.ref.type

type ArrangeOptions = { cols?: number; origin?: { x: number; y: number } }

/** 只改坐标与标题归属；等宽列不拉伸图片，锁定元素原位保留。 */
export function arrange(items: CanvasItem[], mode: ArrangeMode, opts: ArrangeOptions = {}): CanvasItem[] {
  const movable = items.filter(i => !i.locked)
  if (!movable.length) return items
  const locked = items.filter(i => i.locked)
  const ox = opts.origin?.x ?? Math.min(...movable.map(i => i.x))
  // 锁定节点是障碍；在它们下方整理，避免覆盖原位内容。
  const oy = Math.max(opts.origin?.y ?? Math.min(...movable.map(i => i.y)), ...locked.map(i => i.y + itemHeight(i) + GAP))
  const requestedCols = opts.cols ?? Math.ceil(Math.sqrt(movable.length * 1.6))
  const cols = Number.isFinite(requestedCols) ? Math.min(movable.length, Math.max(1, Math.floor(requestedCols))) : 1
  const cw = Math.max(...movable.map(i => i.w))
  const positioned = new Map<string, CanvasItem>()
  const put = (i: CanvasItem, x: number, y: number, section?: CanvasCategory) => positioned.set(i.id, { ...i, x, y, layoutSection: section })

  const grid = (group: CanvasItem[], startY: number, section?: CanvasCategory) => {
    let y = startY
    for (let r = 0; r < group.length; r += cols) {
      const row = group.slice(r, r + cols)
      row.forEach((item, col) => put(item, ox + col * (cw + GAP), y, section))
      y += Math.max(...row.map(itemHeight)) + GAP
    }
    return y
  }

  if (mode === 'category') {
    let y = oy
    for (const category of canvasCategories) {
      const group = movable.filter(i => itemCategory(i) === category.id)
      y = Math.max(grid(group, y + TITLE, category.id), y + TITLE + 48) + SECTION_GAP
    }
  } else if (mode === 'masonry') {
    const heights: number[] = Array.from({ length: cols }, () => oy)
    for (const item of movable) {
      const col = heights.indexOf(Math.min(...heights))
      put(item, ox + col * (cw + GAP), heights[col])
      heights[col] += itemHeight(item) + GAP
    }
  } else {
    const time = (i: CanvasItem) => {
      const t = Date.parse(i.createdAt ?? i.startedAt ?? '')
      return Number.isFinite(t) ? t : Infinity
    }
    // 原数组顺序是未知时间和同一时间的稳定后备；不使用 ID 排序。
    grid(mode === 'time' ? [...movable].sort((a, b) => time(a) - time(b)) : movable, oy)
  }
  return items.map(i => positioned.get(i.id) ?? i)
}

/** 标题随已保存节点投影，空类别仍显示；不创建额外节点或修改 parentId。 */
export function layoutSections(items: CanvasItem[]) {
  const grouped = items.filter(i => i.layoutSection)
  if (!grouped.length) return []
  const x = Math.min(...grouped.map(i => i.x))
  const width = Math.max(...grouped.map(i => i.x + i.w)) - x
  const firstIndex = canvasCategories.findIndex(category => grouped.some(i => i.layoutSection === category.id))
  const firstGroup = grouped.filter(i => i.layoutSection === canvasCategories[firstIndex].id)
  let nextY = Math.min(...firstGroup.map(i => i.y)) - TITLE - firstIndex * (TITLE + 48 + SECTION_GAP)
  return canvasCategories.map(category => {
    const group = grouped.filter(i => i.layoutSection === category.id)
    const y = group.length ? Math.min(...group.map(i => i.y)) - TITLE : nextY
    nextY = group.length ? Math.max(...group.map(i => i.y + itemHeight(i))) + GAP + SECTION_GAP : y + TITLE + 48 + SECTION_GAP
    return { ...category, x, y, width, count: group.length }
  })
}

/** 新内容的落点：现有内容下方 */
export function nextSlot(items: CanvasItem[]) {
  if (!items.length) return { x: 0, y: 0 }
  return { x: Math.min(...items.map((i) => i.x)), y: Math.max(...items.map((i) => i.y + itemHeight(i))) + 40 }
}

/** Reserve sibling slots once. Keep the source's y and move right past actual
 * intersecting rectangles. Existing IDs retain the user's layout on replay. */
export function placeResults(existing: CanvasItem[], results: CanvasItem[], anchorId?: string): CanvasItem[] {
  const occupied = [...existing]
  const origin = nextSlot(existing)
  const cursors = new Map<string | undefined, number>()
  return results.map(result => {
    const anchor = occupied.find(item => item.id === (anchorId ?? result.parentIds?.[0] ?? result.parentId))
    const cursor = cursors.get(anchor?.id) ?? (anchor ? anchor.x + anchor.w + 48 : origin.x)
    const saved = existing.find(item => item.id === result.id)
    if (saved) {
      cursors.set(anchor?.id, Math.max(cursor, saved.x + saved.w + GAP))
      return { ...result, x: saved.x, y: saved.y, w: saved.w, ...(saved.locked !== undefined ? { locked: saved.locked } : {}) }
    }
    let x = cursor
    const y = anchor?.y ?? origin.y
    const height = itemHeight(result)
    const blockers = occupied.filter(item => item.y < y + height + GAP && item.y + itemHeight(item) + GAP > y)
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    for (const item of blockers) {
      if (x < item.x + item.w + GAP && x + result.w + GAP > item.x) x = item.x + item.w + GAP
    }
    const placed = { ...result, x, y }
    occupied.push(placed)
    cursors.set(anchor?.id, x + result.w + GAP)
    return placed
  })
}
