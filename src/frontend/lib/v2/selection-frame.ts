export interface ScreenRect { x: number; y: number; width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))

/** Screen-space decorations stay inside the canvas, regardless of node size/zoom. */
export function selectionFrame(node: ScreenRect, viewport: { width: number; height: number }, label: { width: number; height: number }, occupied?: ScreenRect) {
  if (viewport.width <= 0 || viewport.height <= 0 || node.x + node.width < 0 || node.y + node.height < 0 ||
      node.x > viewport.width || node.y > viewport.height) return null
  const inset = 6
  const left = clamp(node.x, inset, viewport.width - inset)
  const right = clamp(node.x + node.width, inset, viewport.width - inset)
  const top = clamp(node.y, inset, viewport.height - inset)
  const bottom = clamp(node.y + node.height, inset, viewport.height - inset)
  const labelWidth = Math.min(label.width, Math.max(0, viewport.width - inset * 2))
  const below = node.y + node.height + 8
  const y = below + label.height <= viewport.height - inset ? below : node.y + node.height - label.height - 8
  const x = clamp(node.x, inset, viewport.width - labelWidth - inset)
  const candidates = [y, node.y - label.height - 8, node.y + 8,
    ...(occupied ? [occupied.y + occupied.height + 8, occupied.y - label.height - 8] : [])]
    .map(value => clamp(value, inset, viewport.height - label.height - inset))
  const clearY = candidates.find(value => !occupied || x + labelWidth + 4 <= occupied.x
    || x >= occupied.x + occupied.width + 4 || value + label.height + 4 <= occupied.y
    || value >= occupied.y + occupied.height + 4) ?? candidates[0]
  return {
    corners: [
      { id: 'nw' as const, x: left, y: top },
      { id: 'ne' as const, x: right, y: top },
      { id: 'sw' as const, x: left, y: bottom },
      { id: 'se' as const, x: right, y: bottom },
    ],
    edges: [
      { id: 'n' as const, x: (left + right) / 2, y: top, length: Math.max(0, right - left) },
      { id: 's' as const, x: (left + right) / 2, y: bottom, length: Math.max(0, right - left) },
      { id: 'w' as const, x: left, y: (top + bottom) / 2, length: Math.max(0, bottom - top) },
      { id: 'e' as const, x: right, y: (top + bottom) / 2, length: Math.max(0, bottom - top) },
    ],
    label: { x, y: clearY, width: labelWidth },
  }
}

/** The toolbar flips then clamps vertically as well as horizontally. */
export function selectionToolbar(node: ScreenRect, viewport: ScreenRect, toolbar: { width: number; height: number }): ScreenRect {
  const above = node.y - toolbar.height - 12
  const y = above >= viewport.y + 8 ? above : node.y + node.height + 12
  return { x: clamp(node.x, viewport.x + 12, viewport.x + viewport.width - toolbar.width - 12),
    y: clamp(y, viewport.y + 8, viewport.y + viewport.height - toolbar.height - 8), ...toolbar }
}

export function selectionSidePosition(node: ScreenRect, viewport: { width: number; height: number }, tools: { width: number; height: number }) {
  const preferred = node.x + node.width + tools.width + 24 <= viewport.width ? node.x + node.width + 12 : node.x - tools.width - 12
  return { x: clamp(preferred, 12, viewport.width - tools.width - 12),
    y: clamp(node.y, 12, viewport.height - tools.height - 12), maxHeight: Math.max(1, viewport.height - 24) }
}
