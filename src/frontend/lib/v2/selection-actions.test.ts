import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource, TOOLS } from './mock'
import { pasteCanvasItems, reorderCanvasItems, selectionTools, usableImage } from './selection-actions'
import { itemHeight } from './arrange'
import type { AgentEvent } from './data-source'
import type { CanvasItem } from './types'

const source: CanvasItem = { id: 'a', ref: { type: 'generation', id: 'asset' }, image: { id: 'asset', url: '/image.png', width: 100, height: 200 }, x: 10, y: 20, w: 100, status: 'done', toolRunId: 'run', startedAt: '2026-11-15T00:00:00Z', retryAllowed: true, parentId: 'original', locked: true }

test('两处单图动作来自目录，隐藏工具不复活，更多只含可运行工具', () => {
  const actions = selectionTools(TOOLS)
  assert.deepEqual(actions.common.map(t => t.id), ['upscale', 'outpaint', 'cutout', 'erase', 'inpaint'])
  assert.ok(actions.more.some(t => t.id === 'detail-page'))
  assert.ok(actions.more.every(t => t.backendToolId && !t.editor))
  assert.equal(selectionTools(TOOLS.filter(t => t.id !== 'cutout')).common.some(t => t.id === 'cutout'), false)
  assert.deepEqual(selectionTools([]), { common: [], more: [] })
  assert.equal(usableImage({ ...source, status: 'failed' }), false)
  assert.equal(usableImage({ ...source, image: { ...source.image, url: '' } }), false)
})

test('多图粘贴保留相对坐标和资源归属，不复制任务身份或失败占位', () => {
  let seq = 0
  const next = pasteCanvasItems([source, { ...source, id: 'b', x: 150, y: 60 }, { ...source, id: 'running', status: 'running' }], [source], () => `new-${++seq}`)
  assert.deepEqual(next.map(i => [i.id, i.x, i.y]), [['new-1', 298, 20], ['new-2', 438, 60]])
  assert.deepEqual(next[0].ref, source.ref)
  assert.equal(next[0].parentId, source.parentId)
  for (const item of next) {
    assert.equal(item.toolRunId, undefined)
    assert.equal(item.retryAllowed, undefined)
    assert.equal(item.locked, undefined)
  }
  next[0].image.url = '/changed.png'
  assert.equal(source.image.url, '/image.png')
  const at = pasteCanvasItems([source], [], () => 'at', { x: -50, y: 80 })
  assert.deepEqual([at[0].x, at[0].y], [-50, 80])
  assert.deepEqual(pasteCanvasItems([], [], () => 'empty'), [])
})

test('图层移动保持批量相对顺序且不更改原数组', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ ...source, id }))
  assert.deepEqual(reorderCanvasItems(items, ['c', 'a'], true).map(i => i.id), ['b', 'd', 'a', 'c'])
  assert.deepEqual(reorderCanvasItems(items, ['b', 'd'], false).map(i => i.id), ['b', 'd', 'a', 'c'])
  assert.deepEqual(items.map(i => i.id), ['a', 'b', 'c', 'd'])
})

test('常用工具 mock 均先在源图右侧新增生成中节点，再更新同一节点成图', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Mock canvas actions must not call upstream') }
  try {
    const ds = createMockDataSource({ pause: async () => {} })
    const project = await ds.createProject({})
    await ds.saveCanvas(project.id, [source, { ...source, id: 'neighbor', x: 250 }])
    for (const tool of selectionTools(await ds.listTools()).common) {
      const before = await ds.getProject(project.id)
      assert.ok(before)
      const events: AgentEvent[] = []
      const run = ds.runTool(project.id, tool.options ? `${tool.id}:${tool.options[0].id}` : tool.id, [source.id], e => events.push(e), { n: 1, maskDataUrl: 'data:image/png;base64,mock-mask' })
      const added = events.find(e => e.type === 'item-add')
      assert.ok(added?.type === 'item-add', tool.id)
      assert.equal(added.item.status, 'running')
      assert.equal(added.item.parentId, source.id)
      assert.equal(added.item.y, source.y)
      assert.ok(added.item.x > source.x + source.w, '结果在源图右侧')
      // G4 reserves the actual target rectangle, including prior tool results.
      for (const item of before.items) {
        const overlaps: boolean = added.item.x < item.x + item.w && added.item.x + added.item.w > item.x
          && added.item.y < item.y + itemHeight(item) && added.item.y + itemHeight(added.item) > item.y
        assert.equal(overlaps, false, `${tool.id} 不应与 ${item.id} 重叠`)
      }
      assert.equal(added.item.generationPhase, 'queued')
      assert.deepEqual(added.item.placeholder, source.image)
      await run
      const updates = events.filter(e => e.type === 'item-update')
      assert.ok(updates.some(e => e.patch.generationPhase === 'generating'))
      assert.ok(updates.some(e => e.patch.generationPhase === 'processing'))
      const completed = updates.filter(e => e.patch.status === 'done')
      assert.equal(completed.length, 1)
      const done = completed[0]
      assert.ok(done?.type === 'item-update')
      assert.equal(done.id, added.item.id)
      assert.equal(done.patch.status, 'done')
      assert.ok(done.patch.image?.url)
      const snapshot = await ds.getProject(project.id)
      const result = snapshot?.items.find(item => item.id === added.item.id)
      assert.ok(result)
      assert.equal(result.status, 'done')
      assert.deepEqual([result.x, result.y, result.w, result.targetSize], [added.item.x, added.item.y, added.item.w, added.item.targetSize])
      assert.equal(events.at(-1)?.type, 'done')
    }
  } finally { globalThis.fetch = originalFetch }
})
