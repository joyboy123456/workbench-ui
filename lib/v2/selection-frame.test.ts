import assert from 'node:assert/strict'
import test from 'node:test'
import { selectionFrame, selectionToolbar } from './selection-frame'

test('all four canvas edges keep labels and handles inside at small and large zoom', () => {
  for (const zoom of [.1, 1, 4]) for (const x of [-100, 0, 390]) for (const y of [-100, 0, 290]) {
    const layout = selectionFrame({ x, y, width: 200 * zoom, height: 300 * zoom }, { width: 400, height: 300 }, { width: 170, height: 28 })
    if (!layout) continue
    for (const corner of layout.corners) {
      assert.ok(corner.x >= 6 && corner.x <= 394)
      assert.ok(corner.y >= 6 && corner.y <= 294)
    }
    assert.ok(layout.label.x >= 6 && layout.label.x + layout.label.width <= 394)
    assert.ok(layout.label.y >= 6 && layout.label.y + 28 <= 294)
  }
})
test('bottom label flips inside and offscreen selections do not leave floating controls', () => {
  const layout = selectionFrame({ x: 20, y: 150, width: 150, height: 145 }, { width: 400, height: 300 }, { width: 170, height: 28 })
  assert.equal(layout?.label.y, 259)
  assert.equal(selectionFrame({ x: 500, y: 0, width: 100, height: 100 }, { width: 400, height: 300 }, { width: 170, height: 28 }), null)
})

test('右上及超大节点的工具栏和尺寸标签均在视口内且互不重叠', () => {
  const viewport = { x: 0, y: 0, width: 800, height: 600 }
  for (const node of [{ x: 730, y: 5, width: 150, height: 200 }, { x: 730, y: -10, width: 400, height: 800 }]) {
    const toolbar = selectionToolbar(node, viewport, { width: 450, height: 44 })
    const layout = selectionFrame(node, viewport, { width: 180, height: 28 }, toolbar)!
    assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= 800)
    assert.ok(toolbar.y >= 0 && toolbar.y + toolbar.height <= 600)
    assert.ok(layout.label.x >= 0 && layout.label.x + layout.label.width <= 800)
    assert.ok(layout.label.y >= 0 && layout.label.y + 28 <= 600)
    assert.ok(layout.label.x >= toolbar.x + toolbar.width || layout.label.x + layout.label.width <= toolbar.x
      || layout.label.y >= toolbar.y + toolbar.height || layout.label.y + 28 <= toolbar.y)
  }
})
