import assert from 'node:assert/strict'
import test from 'node:test'
import { arrange } from './arrange'
import { createCanvasHistory } from './canvas-history'
import type { CanvasItem } from './types'

const item = (id: string, x = 120): CanvasItem => ({
  id, x, y: 35, w: 100, ref: { type: 'material', id },
  image: { id, url: '/mock.png', width: 200, height: 300 }, parentId: 'source',
})

test('arrangement undo restores every original position, category and source; redo restores the layout', () => {
  const initial = Array.from({ length: 300 }, (_, n) => item(`node-${n}`, n * 13))
  const history = createCanvasHistory(initial)
  const arranged = arrange(initial, 'category', { cols: 12 })
  history.update(arranged)
  assert.deepEqual(history.counts, { past: 1, future: 0 })
  history.undo()
  assert.deepEqual(history.items, initial)
  history.redo()
  assert.deepEqual(history.items, arranged)
})

test('a drag with many intermediate frames is one undo step from the gesture start', () => {
  const initial = [item('drag')]
  const history = createCanvasHistory(initial)
  history.beginMove()
  for (let x = 130; x <= 300; x += 10) history.update(items => items.map(i => ({ ...i, x })), false)
  history.endMove()
  assert.deepEqual(history.counts, { past: 1, future: 0 })
  history.undo()
  assert.deepEqual(history.items, initial)
  history.redo()
  assert.equal(history.items[0].x, 300)
  history.beginMove(); history.endMove()
  assert.deepEqual(history.counts, { past: 1, future: 0 })
})

test('asynchronous results and completion survive undo/redo, including updates during a drag', () => {
  const history = createCanvasHistory([{ ...item('pending'), status: 'running' }])
  history.beginMove()
  history.update(items => items.map(i => ({ ...i, x: 500 })), false)
  const result = item('new-result')
  history.receive(items => [...items, result])
  history.receive(items => items.map(i => i.id === 'pending' ? { ...i, status: 'done', image: { ...i.image, url: '/finished.png' } } : i))
  history.endMove()
  history.undo()
  assert.equal(history.items[0].x, 120)
  assert.equal(history.items[0].status, 'done')
  assert.equal(history.items[0].image.url, '/finished.png')
  assert.equal(history.items[1], result)
  history.receive(items => items.map(i => i.id === result.id ? { ...i, errorMessage: '最新状态' } : i))
  history.redo()
  assert.equal(history.items[0].x, 500)
  assert.equal(history.items[0].status, 'done')
  assert.equal(history.items[1].errorMessage, '最新状态')
})

test('new edits clear redo and project reset clears gestures and history, with a 50 step limit', () => {
  const history = createCanvasHistory([item('one')])
  for (let x = 0; x < 60; x++) history.update(items => items.map(i => ({ ...i, x })))
  assert.equal(history.counts.past, 50)
  history.undo()
  history.update([item('two')])
  assert.equal(history.counts.future, 0)
  history.beginMove()
  history.reset([])
  history.undo(); history.redo(); history.endMove()
  assert.deepEqual(history.items, [])
  assert.deepEqual(history.counts, { past: 0, future: 0 })
})
