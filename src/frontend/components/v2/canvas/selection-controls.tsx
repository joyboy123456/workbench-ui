'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useViewport } from '@xyflow/react'
import { proportionalSize } from '@/lib/v2/canvas-raster'
import { selectionBounds } from '@/lib/v2/selection-actions'
import { selectionSidePosition } from '@/lib/v2/selection-frame'
import type { CanvasItem } from '@/lib/v2/types'
import { Icon } from '../icons'

/** The node can touch any edge; tools flip together and stay inside the stage. */
export function SelectionSideTools({ items, stage, children }: { items: CanvasItem[]; stage: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const viewport = useViewport()
  const element = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ x: 12, y: 12, maxHeight: 600 })
  const bounds = selectionBounds(items)
  useEffect(() => { setHost(stage.current) }, [stage])
  useLayoutEffect(() => {
    const content = element.current
    if (!host || !content) return
    const measure = () => {
      const left = bounds.x * viewport.zoom + viewport.x
      const top = bounds.y * viewport.zoom + viewport.y
      const next = selectionSidePosition({ x: left, y: top, width: (bounds.right - bounds.x) * viewport.zoom, height: 0 },
        { width: host.clientWidth, height: host.clientHeight }, { width: content.offsetWidth, height: content.offsetHeight })
      setPosition(previous => previous.x === next.x && previous.y === next.y && previous.maxHeight === next.maxHeight ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host); observer.observe(content)
    return () => observer.disconnect()
  }, [host, bounds.x, bounds.y, bounds.right, viewport.x, viewport.y, viewport.zoom])
  return host ? createPortal(<div ref={element} className="canvas-selection-side nodrag nopan nowheel" style={{ left: position.x, top: position.y, maxHeight: position.maxHeight }}>{children}</div>, host) : null
}

export function ImageDimensionsControl({ item, onPatch, onResize, busy }: {
  item: CanvasItem; onPatch: (patch: Partial<CanvasItem>) => void; onResize: (width: number, height: number) => void; busy?: boolean
}) {
  const [size, setSize] = useState({ width: String(item.image.width), height: String(item.image.height) })
  const [error, setError] = useState('')
  useEffect(() => { setSize({ width: String(item.image.width), height: String(item.image.height) }); setError('') }, [item.id, item.image.width, item.image.height])
  const change = (axis: 'width' | 'height', value: string) => {
    setSize(previous => ({ ...previous, [axis]: value })); setError('')
    try {
      const next = proportionalSize(item.image.width, item.image.height, axis, Number(value), item.aspectRatioLocked !== false)
      setSize({ width: String(next.width), height: String(next.height) })
    } catch { /* Keep an incomplete entry editable; validate on apply. */ }
  }
  return <form className="canvas-dimensions nodrag nopan nowheel" aria-label="图片尺寸" onPointerDown={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()} onSubmit={event => {
      event.preventDefault()
      try {
        const next = proportionalSize(Number(size.width), Number(size.height), 'width', Number(size.width), false)
        setError(''); onResize(next.width, next.height)
      } catch (failure) { setError(failure instanceof Error ? failure.message : '尺寸无效') }
    }}>
    <button type="button" title={item.resolutionLocked ? '解除分辨率锁定' : '锁定分辨率'} aria-label="锁定分辨率" aria-pressed={Boolean(item.resolutionLocked)} disabled={busy} onClick={() => onPatch({ resolutionLocked: !item.resolutionLocked })}><Icon name={item.resolutionLocked ? 'lock' : 'unlock'} size={12} /></button>
    <label>W<input aria-label="图片宽度" inputMode="numeric" value={size.width} disabled={item.resolutionLocked || busy} onChange={event => change('width', event.target.value)} /></label>
    <span aria-hidden>×</span>
    <label>H<input aria-label="图片高度" inputMode="numeric" value={size.height} disabled={item.resolutionLocked || busy} onChange={event => change('height', event.target.value)} /></label>
    <button type="button" title="锁定宽高比" aria-label="锁定宽高比" aria-pressed={item.aspectRatioLocked !== false} disabled={item.resolutionLocked || busy} onClick={() => onPatch({ aspectRatioLocked: item.aspectRatioLocked === false })}><Icon name="ratio" size={13} /></button>
    <button type="submit" title="应用尺寸" aria-label="应用尺寸" disabled={item.resolutionLocked || busy || (Number(size.width) === item.image.width && Number(size.height) === item.image.height)}><Icon name="check" size={13} /></button>
    {error && <span className="canvas-dimensions-error" role="alert">{error}</span>}
  </form>
}

export function VerticalSelectionTools({ multi, children }: { multi: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if ('focusGroup' in HTMLElement.prototype) { element.setAttribute('focusgroup', 'toolbar wrap block'); return }
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const active = element.contains(document.activeElement) ? document.activeElement : buttons[0]
    element.querySelectorAll('button').forEach(button => { button.tabIndex = button === active ? 0 : -1 })
  }, [children])
  return <div ref={ref} className="ftb canvas-side-toolbar nodrag nopan" role="toolbar" aria-label={multi ? '多图侧边工具' : '单图侧边工具'} aria-orientation="vertical"
    onKeyDown={event => {
      if ('focusGroup' in HTMLElement.prototype) return
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      event.preventDefault(); event.stopPropagation(); buttons[next]?.focus()
    }} onFocus={event => {
      if ('focusGroup' in HTMLElement.prototype) return
      if (!(event.target instanceof HTMLButtonElement)) return
      const target = event.target
      event.currentTarget.querySelectorAll('button').forEach(button => { button.tabIndex = button === target ? 0 : -1 })
    }}>{children}</div>
}
