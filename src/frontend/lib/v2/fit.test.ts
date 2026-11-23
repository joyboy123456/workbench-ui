import assert from 'node:assert/strict'
import test from 'node:test'
import { arrange, itemHeight, layoutSections } from './arrange'
import { canvasFitPad, canvasViewport } from './fit'
import type { CanvasItem } from './types'

const item: CanvasItem = {
  id: 'result', x: -250, y: -100, w: 100, ref: { type: 'generation', id: 'g' },
  image: { id: 'img', url: '/mock.png', width: 200, height: 300 },
}

test('show all fits image extents and all four category titles, including empty sections', () => {
  const items = arrange([item], 'category')
  const viewport = canvasViewport(items, 1000, 700)
  assert.ok(viewport)
  const sections = layoutSections(items)
  for (const section of sections) {
    assert.ok(section.x * viewport.zoom + viewport.x >= 56 - .001)
    assert.ok(section.y * viewport.zoom + viewport.y >= 88 - .001)
    assert.ok((section.x + Math.max(140, section.width)) * viewport.zoom + viewport.x <= 1000 - 56 + .001)
    assert.ok((section.y + 32 + (section.count ? 0 : 48)) * viewport.zoom + viewport.y <= 700 - 104 + .001)
  }
  assert.ok((items[0].y + itemHeight(items[0])) * viewport.zoom + viewport.y <= 700 - 104 + .001)
})

test('selection fits only the image, and an open drawer reserves its full width', () => {
  const items = arrange([item], 'category')
  const viewport = canvasViewport(items, 1000, 700, true, true)
  assert.ok(viewport)
  assert.equal(viewport.zoom, 1.75)
  assert.ok((items[0].x + items[0].w) * viewport.zoom + viewport.x <= 1000 - parseInt(canvasFitPad(true).right) + .001)
})

test('fit stays within the canvas zoom range and tolerates empty or unmounted boards', () => {
  assert.equal(canvasViewport([], 1000, 700), null)
  assert.equal(canvasViewport([item], 0, 700), null)
  assert.equal(canvasViewport([item], 1000, 0), null)
  const viewport = canvasViewport(Array.from({ length: 300 }, (_, n) => ({ ...item, id: `n${n}`, x: n % 20 * 200, y: Math.floor(n / 20) * 240 })), 1000, 700)
  assert.ok(viewport && viewport.zoom >= .02 && viewport.zoom < 1)
})
