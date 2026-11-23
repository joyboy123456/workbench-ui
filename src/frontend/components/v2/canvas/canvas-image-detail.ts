'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { useStoreApi } from '@xyflow/react'
import { itemHeight } from '@/lib/v2/arrange'
import type { CanvasItem } from '@/lib/v2/types'

type View = { x: number; y: number; zoom: number; width: number; height: number; density: number }
export const CanvasDetailView = createContext<View | null>(null)

/** One timer per board, including programmatic fit/zoom and pane resizes. */
export function useSettledCanvasView(moving: boolean) {
  const store = useStoreApi()
  const [view, setView] = useState<View | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      clearTimeout(timer)
      setView(null)
      if (moving) return
      timer = setTimeout(() => {
        const { transform: [x, y, zoom], width, height } = store.getState()
        setView({ x, y, zoom, width, height, density: window.devicePixelRatio || 1 })
      }, 200)
    }
    schedule()
    const unsubscribe = store.subscribe((next, prev) => {
      if (next.transform !== prev.transform || next.width !== prev.width || next.height !== prev.height) schedule()
    })
    window.addEventListener('resize', schedule)
    return () => { clearTimeout(timer); unsubscribe(); window.removeEventListener('resize', schedule) }
  }, [moving, store])
  return moving ? null : view
}

function displayUrls(item: CanvasItem) {
  const { image } = item
  return { thumb: image.thumbUrl || image.url, preview: image.url, original: image.url }
}

function desiredSource(item: CanvasItem, view: View, urls: ReturnType<typeof displayUrls>) {
  const { x, y, zoom, width, height, density } = view
  const w = item.w * zoom, h = itemHeight(item) * zoom
  const left = item.x * zoom + x, top = item.y * zoom + y
  if (left >= width || top >= height || left + w <= 0 || top + h <= 0) return urls.thumb
  const source = item.image
  // Fixed output frames contain the image. Account for the letterbox when sizing it.
  const paintedWidth = item.targetSize && source.height > 0 && source.width > 0 ? Math.min(w, h * source.width / source.height) : w
  const needed = paintedWidth * density
  if (needed <= 400 || (source.width > 0 && source.width <= 400)) return urls.thumb
  const previewWidth = source.width > 0 && source.height > 0 ? 1600 * Math.min(1, source.width / source.height) : 1600
  return needed <= previewWidth ? urls.preview : urls.original
}

export function useCanvasImageDetail(item: CanvasItem, retryOriginal: boolean) {
  const view = useContext(CanvasDetailView)
  const urls = displayUrls(item)
  const enabled = item.status !== 'running' && item.status !== 'failed' && item.mediaType !== 'video'
  const base = enabled && retryOriginal ? urls.original : urls.thumb
  const target = enabled && view ? desiredSource(item, view, urls) : null
  const [ready, setReady] = useState<{ base: string; original: string; src: string } | null>(null)
  const original = urls.original
  const shown = ready?.base === base && ready.original === original ? ready.src : base
  useEffect(() => {
    if (!target || target === shown || retryOriginal) return
    let current = true
    const image = new Image()
    image.src = target
    image.decode().then(() => {
      if (current) setReady({ base, original, src: target })
    }).catch(() => { /* Keep the displayed image if the rendition is unavailable. */ })
    return () => { current = false; image.removeAttribute('src') }
  }, [base, original, retryOriginal, shown, target])
  return { src: shown, base }
}
