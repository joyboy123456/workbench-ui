import assert from 'node:assert/strict'
import test from 'node:test'
import { comparePair, compareSibling, compareSourceId, previewItemId, sliderClip } from './compare'
import type { CanvasItem } from './types'

const card = (id: string, patch: Partial<CanvasItem> = {}): CanvasItem => ({
  id, image: { id: `image-${id}`, url: `/${id}.png`, width: 800, height: 1000 },
  ref: { type: 'material', id }, x: 0, y: 0, w: 150, ...patch,
})

test('无来源和未知节点不补造来源或兄弟', () => {
  const original = card('original')
  assert.deepEqual(comparePair('original', [original]), { left: null, right: original, siblings: [original] })
  assert.deepEqual(comparePair('missing', [original]), { left: null, right: null, siblings: [] })
})

test('第一来源优先；第一来源已删时保留缺失，不拿第二来源替代', () => {
  const first = card('first')
  const second = card('second')
  const result = card('result', { parentIds: ['first', 'second'] })
  assert.equal(comparePair(result.id, [second, result, first]).left, first)
  assert.deepEqual(comparePair(result.id, [second, result]), { left: null, right: result, siblings: [result] })
  assert.equal(compareSourceId(result), 'first')
})

test('兼容旧 parentId；显式空来源不回退；自引用不作为来源', () => {
  const source = card('source')
  const old = card('old', { parentId: source.id })
  const cleared = card('cleared', { parentId: source.id, parentIds: [] })
  const self = card('self', { parentIds: ['self', 'source', 'source'] })
  const items = [source, old, cleared, self]
  assert.equal(comparePair(old.id, items).left, source)
  assert.equal(comparePair(cleared.id, items).left, null)
  assert.equal(comparePair(self.id, items).left, source)
})

test('同第一来源多兄弟按真实 createdAt 升序，稳定处理同时间、缺失和非法时间', () => {
  const source = card('source')
  const recent = card('recent', { parentIds: ['source'], createdAt: '2026-11-16T02:00:00Z' })
  const unknown = card('unknown', { parentIds: ['source'] })
  const early = card('early', { parentIds: ['source'], createdAt: '2026-11-16T09:00:00+08:00' })
  const tied = card('tied', { parentId: 'source', createdAt: '2026-11-16T01:00:00Z' })
  const invalid = card('invalid', { parentIds: ['source'], createdAt: 'invalid' })
  const other = card('other', { parentIds: ['other-source', 'source'] })
  const pending = card('pending', { parentIds: ['source'], status: 'running' })
  const failed = card('failed', { parentIds: ['source'], status: 'failed' })
  const blank = card('blank', { parentIds: ['source'], image: { ...source.image, url: '' } })
  const items = [source, recent, unknown, early, tied, invalid, other, pending, failed, blank]
  const before = structuredClone(items)
  const pair = comparePair(recent.id, items)
  assert.deepEqual(pair.siblings.map(item => item.id), ['early', 'tied', 'recent', 'unknown', 'invalid'])
  assert.equal(pair.right, recent)
  assert.deepEqual(items, before)
})

test('两张直接选中保持选择顺序，忽略来源，且不混入任一方兄弟', () => {
  const source = card('source')
  const a = card('a', { parentIds: ['source'] })
  const b = card('b', { parentIds: ['source'] })
  const items = [source, a, b]
  assert.deepEqual(comparePair(['b', 'a'], items), { left: b, right: a, siblings: [a] })
  assert.deepEqual(comparePair(['source', 'b'], items), { left: source, right: b, siblings: [b] })
})

test('直接对比必须恰好两张不同且可用的图，不从失效选择静默补图', () => {
  const a = card('a')
  const b = card('b')
  const empty = { left: null, right: null, siblings: [] }
  for (const ids of [[], ['a'], ['a', 'a'], ['a', 'deleted'], ['a', 'b', 'c']]) {
    assert.deepEqual(comparePair(ids, [a, b]), empty)
  }
  for (const status of ['running', 'failed'] as const) {
    assert.deepEqual(comparePair(['a', 'b'], [a, { ...b, status }]), empty)
  }
  assert.deepEqual(comparePair(['a', 'b'], [a, { ...b, image: { ...b.image, url: '' } }]), empty)
})

test('左右翻页只在当前同源兄弟内移动，边界不循环', () => {
  const source = card('source')
  const a = card('a', { parentIds: ['source'], createdAt: '2026-11-15' })
  const b = card('b', { parentIds: ['source'], createdAt: '2026-11-16' })
  const items = [source, b, a]
  assert.equal(compareSibling(comparePair('a', items), -1), null)
  assert.equal(compareSibling(comparePair('a', items), 1), 'b')
  assert.equal(compareSibling(comparePair('b', items), -1), 'a')
  assert.equal(compareSibling(comparePair('b', items), 1), null)
  assert.equal(compareSibling(comparePair(['a', 'b'], items), -1), null)
  assert.equal(compareSibling(comparePair('deleted', items), 1), null)
})

test('预览以实际节点图片对象优先，复制节点共用图片 ID 时仍找回正确来源', () => {
  const a = card('a')
  const copy = card('copy', { image: { ...a.image }, parentIds: ['source'] })
  assert.equal(previewItemId(copy.image, [a, copy], [a.id]), copy.id)
  assert.equal(previewItemId({ ...copy.image }, [a, copy], [copy.id]), copy.id)
  assert.equal(previewItemId({ ...copy.image }, [a, copy]), a.id)
  assert.equal(previewItemId(card('missing').image, [a, copy]), null)
})

test('滑杆支持两端、中间、像素宽度与越界；无效宽度不会产生非法 CSS', () => {
  assert.equal(sliderClip(0, 100), 'inset(0 100% 0 0)')
  assert.equal(sliderClip(50, 100), 'inset(0 50% 0 0)')
  assert.equal(sliderClip(100, 100), 'inset(0 0% 0 0)')
  assert.equal(sliderClip(200, 800), 'inset(0 75% 0 0)')
  assert.equal(sliderClip(-20, 100), 'inset(0 100% 0 0)')
  assert.equal(sliderClip(Infinity, 100), 'inset(0 0% 0 0)')
  assert.equal(sliderClip(NaN, 100), 'inset(0 100% 0 0)')
  for (const width of [0, -1, NaN, Infinity]) assert.equal(sliderClip(50, width), 'inset(0 100% 0 0)')
})
