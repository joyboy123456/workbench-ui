import { getViewportForBounds } from '@xyflow/react'
import { itemHeight, layoutSections } from './arrange'
import type { CanvasItem } from './types'

/** 画布 fitView 的留白：左侧让出浮动对话面板，右侧可让出资产抽屉 */
export const fitPad = (drawer = false) => ({ top: '72px', right: drawer ? '380px' : '48px', bottom: '80px', left: '404px' } as const)

/** V2 分栏画布已让出左侧对话；右侧导航/抽屉与底部工具需要额外留白。 */
export const canvasFitPad = (drawer = false) => ({
  top: '88px', right: drawer ? '368px' : '56px', bottom: '104px', left: '56px',
} as const)

export const canvasMotionDuration = (duration = 300) =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration

/** 输入区与弹窗保留自己的键盘行为。 */
export const isCanvasInput = (target: EventTarget | null) =>
  typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('input, textarea, select, dialog, [role="dialog"], [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))

/** 分类标题不是节点，但展示全部时仍须纳入范围，包含零张图片的分区。 */
export function canvasViewport(items: CanvasItem[], width: number, height: number, drawer = false, selection = false) {
  if (!items.length || width <= 0 || height <= 0) return null
  const sections = selection ? [] : layoutSections(items)
  const x = Math.min(...items.map(item => item.x), ...sections.map(section => section.x))
  const y = Math.min(...items.map(item => item.y), ...sections.map(section => section.y))
  const right = Math.max(...items.map(item => item.x + item.w), ...sections.map(section => section.x + Math.max(140, section.width)))
  const bottom = Math.max(...items.map(item => item.y + itemHeight(item)), ...sections.map(section => section.y + 32 + (section.count ? 0 : 48)))
  return getViewportForBounds({ x, y, width: right - x, height: bottom - y }, width, height, .02, selection ? 1.75 : 1, canvasFitPad(drawer))
}
