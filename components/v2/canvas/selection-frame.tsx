'use client'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useViewport } from '@xyflow/react'
import { imageDimensions } from '@/lib/v2/image-metadata'
import { itemHeight } from '@/lib/v2/arrange'
import { selectionFrame, type ScreenRect } from '@/lib/v2/selection-frame'
import type { CanvasItem } from '@/lib/v2/types'
import { Icon } from '../icons'

export function SelectionFrame({ item, stage, children }: { item: CanvasItem; stage: RefObject<HTMLDivElement | null>; children?: ReactNode }) {
  const viewport = useViewport()
  const [occupied, setOccupied] = useState<ScreenRect>()
  const label = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState({ width: 0, height: 0, labelWidth: 180, labelHeight: 28 })
  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const measure = () => {
      setSizes({ width: element.clientWidth, height: element.clientHeight,
        labelWidth: label.current?.offsetWidth || 180, labelHeight: label.current?.offsetHeight || 28 })
      const toolbar = element.querySelector<HTMLElement>('.selection-toolbar')
      const anchor = toolbar?.parentElement?.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      setOccupied(toolbar && anchor ? { x: anchor.left - rect.left, y: anchor.top - rect.top,
        width: toolbar.offsetWidth, height: toolbar.offsetHeight } : undefined)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (label.current) observer.observe(label.current)
    const toolbar = element.querySelector('.selection-toolbar')
    if (toolbar) observer.observe(toolbar)
    const frame = requestAnimationFrame(measure)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [stage, item.image.width, item.image.height, item.x, item.y, item.w, viewport.x, viewport.y, viewport.zoom])
  const layout = selectionFrame({ x: item.x * viewport.zoom + viewport.x, y: item.y * viewport.zoom + viewport.y,
    width: item.w * viewport.zoom, height: itemHeight(item) * viewport.zoom }, sizes,
  { width: sizes.labelWidth, height: sizes.labelHeight }, occupied)
  const at = (x: number, y: number): CSSProperties => ({ '--selection-x': `${x}px`, '--selection-y': `${y}px` } as CSSProperties)
  return <div className="canvas-selection-frame" hidden={!layout}>
    {layout?.corners.map((corner, index) => <i key={index} className="canvas-selection-handle" style={at(corner.x, corner.y)} aria-hidden />)}
    <div ref={label} className="szc canvas-selection-size" style={layout ? at(layout.label.x, layout.label.y) : undefined}>
      {children ?? <><Icon name="lock" size={12} />{imageDimensions(item.image)}</>}
    </div>
  </div>
}
