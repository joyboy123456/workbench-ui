'use client'
import { ViewportPortal, useViewport } from '@xyflow/react'
import type { SnapGuide } from '@/lib/v2/canvas-snap'

function guidePath(guide: SnapGuide, px: number): string {
  if (guide.kind === 'line') {
    const { axis, at, from, to, marks } = guide
    const line = axis === 'x' ? `M${at} ${from}V${to}` : `M${from} ${at}H${to}`
    const half = 2.5 * px
    const crosses = marks.map(({ x, y }) =>
      `M${x - half} ${y - half}L${x + half} ${y + half}M${x - half} ${y + half}L${x + half} ${y - half}`)
    return [line, ...crosses].join(' ')
  }
  const { axis, from, to, cross } = guide
  const tick = (at: number, half: number) => axis === 'x'
    ? `M${at} ${cross - half}V${cross + half}`
    : `M${cross - half} ${at}H${cross + half}`
  const line = axis === 'x' ? `M${from} ${cross}H${to}` : `M${cross} ${from}V${to}`
  return [line, tick(from, 7 * px), tick(to, 7 * px), tick((from + to) / 2, 3.5 * px)].join(' ')
}

export function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  const { zoom } = useViewport()
  if (!guides.length) return null
  const px = 1 / zoom
  return <ViewportPortal>
    <svg className="canvas-snap-guides" aria-hidden="true" strokeWidth={px}>
      {guides.map((guide, index) => <path key={index} d={guidePath(guide, px)} />)}
    </svg>
  </ViewportPortal>
}
