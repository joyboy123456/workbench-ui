import assert from 'node:assert/strict'
import test from 'node:test'
import { arrange, itemCategory, itemHeight, layoutSections, nextSlot, placeResults } from './arrange'
import type { ArrangeMode, CanvasItem } from './types'

const card = (id: string, x = 0, y = 0, w = 150, height = 200): CanvasItem => ({
  id, ref: { type: 'material', id }, image: { id, url: '/test.png', width: w, height }, x, y, w,
})
const overlaps = (a: CanvasItem, b: CanvasItem) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + itemHeight(b) && a.y + itemHeight(a) > b.y

test('siblings use source y, avoid every intersecting rectangle and preserve inputs', () => {
  const existing = [card('source', -100, 30), card('short', 130, 20, 190, 60), card('low', 400, 220, 80, 140)]
  const results = Array.from({ length: 6 }, (_, index) => ({ ...card(`result-${index}`, 0, 0, 120 + index * 20, 350), parentIds: ['source'] }))
  const before = structuredClone(existing)
  const placed = placeResults(existing, results)
  assert.deepEqual(placed, placeResults([...existing].reverse(), results), 'occupied array order does not affect placement')
  assert.deepEqual(existing, before)
  for (const [index, item] of placed.entries()) {
    assert.equal(item.y, 30)
    assert.ok(item.x > existing[0].x + existing[0].w)
    assert.ok([...existing, ...placed.slice(0, index)].every(other => !overlaps(item, other)))
  }
})

test('sequential batches and old parentId reserve stable slots; completion never repositions', () => {
  const source = card('source')
  const first = placeResults([source], [{ ...card('a'), parentId: source.id }, { ...card('b'), parentId: source.id }])
  const second = placeResults([source, ...first], [{ ...card('c'), parentIds: [source.id] }])
  assert.ok(second[0].x >= first[1].x + first[1].w + 14)
  const moved = { ...first[0], x: 888, y: -100, w: 240, locked: true }
  const [done] = placeResults([source, moved], [{ ...first[0], status: 'done', image: { ...source.image, width: 1600 } }])
  assert.deepEqual([done.x, done.y, done.w, done.locked], [888, -100, 240, true])
})

test('empty and missing-source batches stay finite, use a shared row and do not overlap', () => {
  assert.deepEqual(placeResults([], []), [])
  const unknown = { ...card('a'), image: { id: 'empty', url: '', width: 0, height: 0 } }
  assert.equal(itemHeight(unknown), unknown.w)
  const placed = placeResults([], [unknown, { ...card('b'), parentIds: ['deleted'] }])
  assert.equal(placed[0].y, placed[1].y)
  assert.ok(!overlaps(placed[0], placed[1]))
  assert.ok(placed.every(item => Number.isFinite(item.x) && Number.isFinite(item.y)))
})

test('mixed-width siblings keep output order after avoiding obstacles', () => {
  const existing = [card('source'), card('obstacle', 350)]
  const results = [300, 60, 150].map((w, index) => ({ ...card(`output-${index}`, 0, 0, w), parentIds: ['source'] }))
  const placed = placeResults(existing, results)
  assert.ok(placed[0].x > 500)
  for (let index = 1; index < placed.length; index++) {
    assert.ok(placed[index].x >= placed[index - 1].x + placed[index - 1].w + 14)
  }
  assert.deepEqual(placeResults([...existing, ...placed], results), placed)
})

test('deterministic mixed-size obstacle fields never collide with new siblings', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const existing = [card('source', -50, -20), ...Array.from({ length: 25 }, (_, i) => card(`block-${i}`, (i * 137 + seed * 73) % 1300, (i * 61 + seed * 19) % 600 - 200, 60 + i * 4, 70 + i * 7))]
    const results = Array.from({ length: 10 }, (_, i) => ({ ...card(`r-${i}`, 0, 0, 90 + i * 11, 60 + i * 31), parentIds: ['source'] }))
    const placed = placeResults(existing, results)
    for (const [index, item] of placed.entries()) assert.ok([...existing, ...placed.slice(0, index)].every(other => !overlaps(item, other)))
  }
})


const item = (id: string, patch: Partial<CanvasItem> = {}): CanvasItem => ({
  id, ref: { type: 'material', id }, image: { id, url: '/mock.png', width: 100, height: 200 },
  x: 80, y: -20, w: 100, parentId: 'source', ...patch,
})
const intersects = (a: CanvasItem, b: CanvasItem) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + itemHeight(b) && a.y + itemHeight(a) > b.y

test('grid has equal column tracks, row heights clear the tallest image, without resizing', () => {
  const input = [item('1', { w: 60 }), item('2', { w: 200 }), item('3'), item('4')]
  const copy = structuredClone(input)
  const out = arrange(input, 'grid', { cols: 2, origin: { x: -10, y: 5 } })
  assert.deepEqual(out.map(i => [i.x, i.y]), [[-10, 5], [204, 5], [-10, 419], [204, 419]])
  assert.deepEqual(out.map(i => [i.w, i.image, i.parentId]), input.map(i => [i.w, i.image, i.parentId]))
  assert.deepEqual(input, copy)
})

test('masonry places the next image in the shortest column at its original ratio', () => {
  const out = arrange([item('tall'), item('short', { image: { id: 'short', url: '/short.png', width: 100, height: 50 } }), item('next')], 'masonry', { cols: 2 })
  assert.equal(out[2].x, out[1].x)
  assert.equal(out[2].y, out[1].y + 50 + 14)
  assert.equal(out[0].w, 100)
})

test('category creates ordered sections and retains empty sections without changing provenance', () => {
  const out = arrange([
    item('result', { ref: { type: 'generation', id: 'gen' } }),
    item('model', { assetKind: 'model' }), item('material'),
    item('product', { ref: { type: 'product', id: 'p', imageId: 'p-image' } }),
  ], 'category', { cols: 2 })
  const sections = layoutSections(out)
  assert.deepEqual(sections.map(s => [s.id, s.label, s.count]), [['product', '商品', 1], ['model', '模特', 1], ['generation', '结果', 1], ['material', '素材', 1]])
  for (let n = 1; n < sections.length; n++) assert.ok(sections[n].y > sections[n - 1].y)
  assert.ok(out.every(i => i.layoutSection === itemCategory(i) && i.parentId === 'source'))
  const partial = layoutSections(arrange([item('only-result', { ref: { type: 'generation', id: 'gen' } })], 'category'))
  assert.deepEqual(partial.map(s => s.count), [0, 0, 1, 0])
  for (let n = 1; n < partial.length; n++) assert.ok(partial[n].y > partial[n - 1].y)
  assert.deepEqual(layoutSections(arrange(out, 'grid')), [])
})

test('time uses actual timestamps, stable ties, unknown dates last, never IDs', () => {
  const out = arrange([
    item('a-unknown'), item('z-first', { createdAt: '2026-01-01T00:00:00.000Z' }),
    item('b-last', { createdAt: '2026-03-01T00:00:00.000Z' }),
    item('a-tie', { startedAt: '2026-01-01T00:00:00.000Z' }), item('b-unknown'),
  ], 'time', { cols: 1 })
  assert.deepEqual([...out].sort((a, b) => a.y - b.y).map(i => i.id), ['z-first', 'a-tie', 'b-last', 'a-unknown', 'b-unknown'])
})

for (const mode of ['grid', 'masonry', 'category', 'time'] satisfies ArrangeMode[]) {
  test(`${mode}: 300 heterogeneous nodes do not overlap and locked positions remain unchanged`, () => {
    const input = Array.from({ length: 300 }, (_, n) => item(`n-${n}`, {
      x: n % 7 * 80, y: n * 3, w: 50 + n % 9 * 20,
      ref: n % 3 === 0 ? { type: 'generation', id: `g-${n}` } : n % 3 === 1 ? { type: 'product', id: `p-${n}`, imageId: `img-${n}` } : { type: 'material', id: `m-${n}` },
      assetKind: n % 4 === 0 ? 'model' : undefined,
      image: { id: `img-${n}`, url: '/mock.png', width: 100 + n % 13 * 40, height: 100 + n % 11 * 50 },
      locked: n === 0 || n === 36,
    }))
    const out = arrange(input, mode, { cols: 12 })
    assert.deepEqual(out.filter(i => i.locked), input.filter(i => i.locked))
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) assert.equal(intersects(out[a], out[b]), false, `${out[a].id} overlaps ${out[b].id}`)
    assert.deepEqual(out.map(i => [i.w, i.image, i.ref, i.parentId]), input.map(i => [i.w, i.image, i.ref, i.parentId]))
  })
}

test('empty, all locked, invalid columns and missing source dimensions remain usable', () => {
  const empty: CanvasItem[] = []
  assert.equal(arrange(empty, 'grid'), empty)
  assert.deepEqual(nextSlot(empty), { x: 0, y: 0 })
  const locked = [item('locked', { locked: true })]
  assert.equal(arrange(locked, 'grid'), locked)
  const items = [item('zero', { image: { id: 'zero', url: '/zero.png', width: 0, height: 0 } }), item('regular')]
  assert.equal(itemHeight(items[0]), 100)
  for (const cols of [0, -1, NaN, Infinity, 2.8]) assert.ok(arrange(items, 'masonry', { cols }).every(i => Number.isFinite(i.x) && Number.isFinite(i.y)))
  assert.deepEqual(nextSlot([item('one')]), { x: 80, y: 220 })
})
