/** 画布拖拽吸附的纯几何计算：不依赖 React、React Flow 或 CanvasItem，坐标均为画布（flow）坐标。 */
export interface SnapRect { id: string; x: number; y: number; w: number; h: number }
export type SnapAxis = 'x' | 'y'
export interface SnapPoint { x: number; y: number }
/**
 * line：axis 为 'x' 时是竖线（x = at，y 从 from 到 to），为 'y' 时是横线；marks 是落在线上的角点与中心点。
 * gap：沿 axis 方向的一段间距（from 到 to），cross 是它在另一轴上的位置。
 */
export type SnapGuide =
  | { kind: 'line'; axis: SnapAxis; at: number; from: number; to: number; marks: SnapPoint[] }
  | { kind: 'gap'; axis: SnapAxis; cross: number; from: number; to: number }
export interface SnapResult { dx: number; dy: number; guides: SnapGuide[] }
export interface SnapMotion { t: number; x: number; y: number; v: number }

/** 吸附阈值，单位为屏幕像素；换算到画布坐标时除以当前缩放。 */
export const SNAP_SCREEN_THRESHOLD = 8
/** 指针速度门限，单位为屏幕像素 / 毫秒；达到或超过时本帧不吸附。 */
export const SNAP_MAX_SPEED = 0.5
const EPSILON = 1e-6

const cross = (axis: SnapAxis): SnapAxis => (axis === 'x' ? 'y' : 'x')
const lo = (rect: SnapRect, axis: SnapAxis) => (axis === 'x' ? rect.x : rect.y)
const span = (rect: SnapRect, axis: SnapAxis) => (axis === 'x' ? rect.w : rect.h)
const hi = (rect: SnapRect, axis: SnapAxis) => lo(rect, axis) + span(rect, axis)
const same = (a: number, b: number) => Math.abs(a - b) < EPSILON
/** 每个矩形在单轴上的三个吸附位置：起边、终边、中线。 */
const stops = (rect: SnapRect, axis: SnapAxis) => [lo(rect, axis), hi(rect, axis), lo(rect, axis) + span(rect, axis) / 2]
/** 每个矩形的五个吸附点：四角加中心。 */
const points = (rect: SnapRect): SnapPoint[] => [
  { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
  { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
]
const closer = (best: number | null, delta: number, threshold: number) =>
  Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best)) ? delta : best

export function boundsOfRects(rects: SnapRect[], id = 'selection'): SnapRect {
  const x = Math.min(...rects.map(rect => rect.x))
  const y = Math.min(...rects.map(rect => rect.y))
  return { id, x, y, w: Math.max(...rects.map(rect => rect.x + rect.w)) - x, h: Math.max(...rects.map(rect => rect.y + rect.h)) - y }
}

/** 吸附候选：不在 exclude 里，且与视口矩形相交（贴边也算）。 */
export function snapCandidates(rects: SnapRect[], exclude: ReadonlySet<string>, viewport: Omit<SnapRect, 'id'>): SnapRect[] {
  return rects.filter(rect => !exclude.has(rect.id)
    && rect.x <= viewport.x + viewport.w && rect.x + rect.w >= viewport.x
    && rect.y <= viewport.y + viewport.h && rect.y + rect.h >= viewport.y)
}

function pointNudge(moving: SnapRect, candidates: SnapRect[], axis: SnapAxis, threshold: number): number | null {
  let best: number | null = null
  for (const own of stops(moving, axis))
    for (const candidate of candidates)
      for (const target of stops(candidate, axis)) best = closer(best, target - own, threshold)
  return best
}

interface GapPair { a: SnapRect; b: SnapRect; gap: number }

/** 在另一轴上与 target 有重叠的候选，按 axis 方向的起边排序。 */
function overlapping(target: SnapRect, candidates: SnapRect[], axis: SnapAxis): SnapRect[] {
  const other = cross(axis)
  return candidates
    .filter(candidate => lo(candidate, other) < hi(target, other) && hi(candidate, other) > lo(target, other))
    .sort((a, b) => lo(a, axis) - lo(b, axis))
}

/** 所有「a 完全在 b 之前、且两者在另一轴上有重叠」的有序对及其间距。 */
function pairsOf(list: SnapRect[], axis: SnapAxis): GapPair[] {
  const other = cross(axis)
  const pairs: GapPair[] = []
  for (const a of list)
    for (const b of list) {
      if (a === b || hi(a, axis) >= lo(b, axis)) continue
      if (lo(a, other) >= hi(b, other) || hi(a, other) <= lo(b, other)) continue
      pairs.push({ a, b, gap: lo(b, axis) - hi(a, axis) })
    }
  return pairs
}

function gapNudge(moving: SnapRect, candidates: SnapRect[], axis: SnapAxis, threshold: number): number | null {
  const size = span(moving, axis)
  let best: number | null = null
  for (const { a, b, gap } of pairsOf(overlapping(moving, candidates, axis), axis)) {
    const targets = [hi(b, axis) + gap, lo(a, axis) - gap - size]
    if (gap - size > 0) targets.push(hi(a, axis) + (gap - size) / 2)
    for (const target of targets) best = closer(best, target - lo(moving, axis), threshold)
  }
  return best
}

function axisNudge(moving: SnapRect, candidates: SnapRect[], axis: SnapAxis, threshold: number): number {
  const point = pointNudge(moving, candidates, axis, threshold)
  const gap = gapNudge(moving, candidates, axis, threshold)
  if (gap !== null && (point === null || Math.abs(gap) <= Math.abs(point))) return gap
  return point ?? 0
}

function lineGuides(moved: SnapRect, candidates: SnapRect[], axis: SnapAxis): SnapGuide[] {
  const other = cross(axis)
  const own = points(moved)
  const targets = candidates.flatMap(points)
  const guides: SnapGuide[] = []
  const values = stops(moved, axis).filter((value, index, all) => all.findIndex(entry => same(entry, value)) === index)
  for (const at of values) {
    const hits = targets.filter(point => same(point[axis], at))
    if (!hits.length) continue
    const marks = [...hits, ...own.filter(point => same(point[axis], at) && !hits.some(hit => same(hit.x, point.x) && same(hit.y, point.y)))]
    const range = marks.map(point => point[other])
    guides.push({ kind: 'line', axis, at, from: Math.min(...range), to: Math.max(...range), marks })
  }
  return guides
}

function gapSegments(moved: SnapRect, candidates: SnapRect[], axis: SnapAxis): [SnapRect, SnapRect][] {
  const list = overlapping(moved, candidates, axis)
  const before = list.filter(candidate => hi(candidate, axis) < lo(moved, axis))
  const after = list.filter(candidate => lo(candidate, axis) > hi(moved, axis))
  const previous = before.reduce<SnapRect | undefined>((best, candidate) => !best || hi(candidate, axis) > hi(best, axis) ? candidate : best, undefined)
  const next = after.reduce<SnapRect | undefined>((best, candidate) => !best || lo(candidate, axis) < lo(best, axis) ? candidate : best, undefined)
  if (previous && next && same(lo(moved, axis) - hi(previous, axis), lo(next, axis) - hi(moved, axis))) return [[previous, moved], [moved, next]]
  const pairs = pairsOf(list, axis)
  for (const candidate of before) {
    const gap = lo(moved, axis) - hi(candidate, axis)
    const matches = pairs.filter(pair => pair.b === candidate && same(pair.gap, gap))
    if (matches.length) return [...matches.map((pair): [SnapRect, SnapRect] => [pair.a, pair.b]), [candidate, moved]]
  }
  for (const candidate of after) {
    const gap = lo(candidate, axis) - hi(moved, axis)
    const matches = pairs.filter(pair => pair.a === candidate && same(pair.gap, gap))
    if (matches.length) return [[moved, candidate], ...matches.map((pair): [SnapRect, SnapRect] => [pair.a, pair.b])]
  }
  return []
}

function gapGuides(moved: SnapRect, candidates: SnapRect[], axis: SnapAxis): SnapGuide[] {
  const other = cross(axis)
  return gapSegments(moved, candidates, axis).map(([a, b]) => ({
    kind: 'gap' as const, axis, from: hi(a, axis), to: lo(b, axis),
    cross: (Math.max(lo(a, other), lo(b, other)) + Math.min(hi(a, other), hi(b, other))) / 2,
  }))
}

/**
 * moving 是被拖动内容在「未吸附」位置的包围盒；返回要追加的位移和吸附后的辅助线。
 * 每个轴独立：点吸附与等距吸附各取最近值，等距不比点吸附远时用等距。
 */
export function snapMove(moving: SnapRect, candidates: SnapRect[], threshold: number): SnapResult {
  if (!candidates.length || !(threshold > 0)) return { dx: 0, dy: 0, guides: [] }
  const dx = axisNudge(moving, candidates, 'x', threshold)
  const dy = axisNudge(moving, candidates, 'y', threshold)
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy }
  return {
    dx, dy,
    guides: [
      ...gapGuides(moved, candidates, 'x'), ...gapGuides(moved, candidates, 'y'),
      ...lineGuides(moved, candidates, 'x'), ...lineGuides(moved, candidates, 'y'),
    ],
  }
}

/** 按采样点更新平滑后的指针速度（屏幕像素 / 毫秒）：每次向瞬时速度靠近一半。 */
export function trackSnapMotion(previous: SnapMotion | null, sample: { t: number; x: number; y: number }, zoom: number): SnapMotion {
  if (!previous) return { ...sample, v: 0 }
  const elapsed = sample.t - previous.t
  if (elapsed <= 0) return { ...sample, v: previous.v }
  const speed = Math.hypot(sample.x - previous.x, sample.y - previous.y) * zoom / elapsed
  return { ...sample, v: previous.v + (speed - previous.v) * 0.5 }
}
