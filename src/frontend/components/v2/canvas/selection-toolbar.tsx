'use client'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type CSSProperties } from 'react'
import { NodeToolbar, Position, useReactFlow, useViewport } from '@xyflow/react'
import { selectionToolbar } from '@/lib/v2/selection-frame'
import { selectionBounds } from '@/lib/v2/selection-actions'
import type { CanvasItem } from '@/lib/v2/types'
import { BatchAction } from './batch-panel'

/** Keep the existing NodeToolbar anchored outside the selection, clamping its
 * width/position to the actual canvas column rather than the whole window. */
export function SelectionToolbar({ items, stage, children }: { items: CanvasItem[]; stage: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const rf = useReactFlow()
  const viewport = useViewport()
  const ref = useRef<HTMLDivElement>(null)
  const [verticalShift, setVerticalShift] = useState(0)
  const [shift, setShift] = useState(0)
  const [width, setWidth] = useState(760)
  const bounds = selectionBounds(items)

  useLayoutEffect(() => {
    const element = ref.current
    const parent = stage.current
    if (!element || !parent) return
    const measure = () => {
      const rect = parent.getBoundingClientRect()
      // CSS entrance transforms must not shrink the collision measurement.
      const toolbar = { width: element.offsetWidth, height: element.offsetHeight }
      const anchor = rf.flowToScreenPosition({ x: bounds.x, y: bounds.y })
      setWidth(Math.max(180, rect.width - 24))
      const placed = selectionToolbar({ x: anchor.x, y: anchor.y,
        width: (bounds.right - bounds.x) * viewport.zoom, height: (bounds.bottom - bounds.y) * viewport.zoom },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, toolbar)
      setShift(placed.x - anchor.x)
      setVerticalShift(placed.y - (anchor.y - toolbar.height - 12))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element); observer.observe(parent)
    return () => observer.disconnect()
  }, [rf, stage, viewport.x, viewport.y, viewport.zoom, bounds.x, bounds.y, bounds.bottom, bounds.right])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if ('focusGroup' in HTMLElement.prototype) { element.setAttribute('focusgroup', 'toolbar wrap'); return }
    const buttons = element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const active = element.contains(document.activeElement) ? document.activeElement : Array.from(buttons).find(b => b.tabIndex === 0) ?? buttons[0]
    element.querySelectorAll('button:disabled').forEach(b => b.setAttribute('tabindex', '-1'))
    buttons.forEach(b => { b.tabIndex = b === active ? 0 : -1 })
  }, [children])

  return (
    <NodeToolbar nodeId={items.map(i => i.id)} isVisible position={Position.Top} align="start" offset={12}>
      <div className="selection-anchor" style={{ left: shift, maxWidth: width, '--toolbar-shift-y': `${verticalShift}px` } as CSSProperties}>
        <div ref={ref} className="ftb selection-toolbar" role="toolbar" aria-label={items.length > 1 ? '批量图片操作' : '图片操作'}
          onFocus={(event) => {
            if ('focusGroup' in HTMLElement.prototype || !(event.target instanceof HTMLButtonElement) || !event.currentTarget.contains(event.target)) return
            const target = event.target
            ref.current?.querySelectorAll('button').forEach(b => { b.tabIndex = b === target ? 0 : -1 })
          }}
          onKeyDown={(event) => {
            if ('focusGroup' in HTMLElement.prototype || !event.currentTarget.contains(event.target as Node) || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
            event.preventDefault(); buttons[index]?.focus()
          }}>
          {children}
          {items.length > 1 && <BatchAction items={items} />}
        </div>
      </div>
    </NodeToolbar>
  )
}
