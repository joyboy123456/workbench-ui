'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { useViewport } from '@xyflow/react'
import { imageDimensions } from '@/lib/v2/image-metadata'
import { itemHeight } from '@/lib/v2/arrange'
import { resizeCanvasItem, type ResizeHandle, type ResizePatch } from '@/lib/v2/canvas-transform'
import { selectionFrame, type ScreenRect } from '@/lib/v2/selection-frame'
import type { CanvasItem } from '@/lib/v2/types'
import { Icon } from '../icons'

const HANDLE_LABELS: Record<ResizeHandle, string> = {
  nw: '拖拉左上角等比缩放',
  ne: '拖拉右上角等比缩放',
  sw: '拖拉左下角等比缩放',
  se: '拖拉右下角等比缩放',
  n: '拖拉上边调整画幅',
  s: '拖拉下边调整画幅',
  w: '拖拉左边调整画幅',
  e: '拖拉右边调整画幅',
}

interface DragSession {
  pointerId: number
  handle: ResizeHandle
  startX: number
  startY: number
  zoom: number
  origin: CanvasItem
  target: Element | null
}

export function SelectionFrame({
  item,
  stage,
  resizable = false,
  onBeginResize,
  onResize,
  onEndResize,
  children,
}: {
  item: CanvasItem
  stage: RefObject<HTMLDivElement | null>
  resizable?: boolean
  onBeginResize?: () => void
  onResize?: (patch: ResizePatch) => void
  onEndResize?: () => void
  children?: ReactNode
}) {
  const viewport = useViewport()
  const [occupied, setOccupied] = useState<ScreenRect>()
  const label = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState({ width: 0, height: 0, labelWidth: 180, labelHeight: 28 })
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null)
  const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null)
  const drag = useRef<DragSession | null>(null)
  const cleanupDrag = useRef<(() => void) | null>(null)
  const callbacks = useRef({ onBeginResize, onResize, onEndResize })
  callbacks.current = { onBeginResize, onResize, onEndResize }

  const finishDrag = useCallback((restore = false) => {
    const session = drag.current
    if (!session) return
    drag.current = null
    cleanupDrag.current?.()
    cleanupDrag.current = null
    try { session.target?.releasePointerCapture?.(session.pointerId) } catch { /* synthetic pointer */ }
    if (restore) {
      callbacks.current.onResize?.({
        x: session.origin.x,
        y: session.origin.y,
        w: session.origin.w,
        ...(session.origin.h !== undefined ? { h: session.origin.h } : {}),
      })
    }
    setActiveHandle(null)
    setLiveSize(null)
    callbacks.current.onEndResize?.()
  }, [])

  useEffect(() => () => finishDrag(false), [finishDrag, item.id])

  const startDrag = (handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>) => {
    if (!resizable || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    finishDrag(false)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* synthetic pointer */ }
    const session: DragSession = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      zoom: Math.max(0.01, viewport.zoom),
      origin: item,
      target: event.currentTarget,
    }
    drag.current = session
    setActiveHandle(handle)
    setLiveSize({ width: Math.round(item.w), height: itemHeight(item) })
    callbacks.current.onBeginResize?.()

    const onMove = (moveEvent: PointerEvent) => {
      if (!drag.current || moveEvent.pointerId !== drag.current.pointerId) return
      const dx = (moveEvent.clientX - drag.current.startX) / drag.current.zoom
      const dy = (moveEvent.clientY - drag.current.startY) / drag.current.zoom
      const patch = resizeCanvasItem(drag.current.origin, drag.current.handle, dx, dy)
      setLiveSize({
        width: patch.w,
        height: patch.h ?? itemHeight({ ...drag.current.origin, w: patch.w, h: undefined }),
      })
      callbacks.current.onResize?.(patch)
    }
    const onEnd = (endEvent: PointerEvent) => {
      if (!drag.current || endEvent.pointerId !== drag.current.pointerId) return
      finishDrag(false)
    }
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape' || !drag.current) return
      keyEvent.preventDefault()
      keyEvent.stopPropagation()
      finishDrag(true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('keydown', onKey, true)
    cleanupDrag.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('keydown', onKey, true)
    }
  }

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
  }, [stage, item.image.width, item.image.height, item.x, item.y, item.w, item.h, viewport.x, viewport.y, viewport.zoom])

  const layout = selectionFrame({ x: item.x * viewport.zoom + viewport.x, y: item.y * viewport.zoom + viewport.y,
    width: item.w * viewport.zoom, height: itemHeight(item) * viewport.zoom }, sizes,
  { width: sizes.labelWidth, height: sizes.labelHeight }, occupied)
  const at = (x: number, y: number, len?: number): CSSProperties => ({
    '--selection-x': `${x}px`,
    '--selection-y': `${y}px`,
    ...(len !== undefined ? { '--selection-len': `${len}px` } : {}),
  } as CSSProperties)

  return <div className={'canvas-selection-frame' + (activeHandle ? ' is-resizing' : '')} hidden={!layout}>
    {resizable && layout?.edges.map(edge => (
      <span
        key={edge.id}
        className={`canvas-selection-edge edge-${edge.id}${edge.length >= 36 ? ' has-pill' : ''}${activeHandle === edge.id ? ' is-active' : ''}`}
        style={at(edge.x, edge.y, edge.length)}
        data-handle={edge.id}
        role="presentation"
        aria-label={HANDLE_LABELS[edge.id]}
        title={HANDLE_LABELS[edge.id]}
        onPointerDown={event => startDrag(edge.id, event)}
      />
    ))}
    {layout?.corners.map(corner => (
      <i
        key={corner.id}
        className={`canvas-selection-handle handle-${corner.id}${resizable ? ' is-resizable' : ''}${activeHandle === corner.id ? ' is-active' : ''}`}
        style={at(corner.x, corner.y)}
        data-handle={corner.id}
        aria-hidden={resizable ? undefined : true}
        aria-label={resizable ? HANDLE_LABELS[corner.id] : undefined}
        title={resizable ? HANDLE_LABELS[corner.id] : undefined}
        onPointerDown={resizable ? event => startDrag(corner.id, event) : undefined}
      />
    ))}
    <div ref={label} className="szc canvas-selection-size" style={layout ? at(layout.label.x, layout.label.y) : undefined}>
      {liveSize ? <span className="tnum">{liveSize.width} × {liveSize.height}</span> : children ?? <><Icon name="lock" size={12} />{imageDimensions(item.image)}</>}
    </div>
  </div>
}
