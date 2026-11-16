import assert from 'node:assert/strict'
import test from 'node:test'
import { arrange } from './arrange'
import { createMockDataSource } from './mock'
import type { CanvasItem } from './types'

// The API boundary is an in-memory snapshot. Network, account and generation are never called.
test('mock save/load preserve layout metadata and original resource refs', async () => {
  const source = createMockDataSource()
  const project = await source.createProject({ name: '布局往返' })
  const input: CanvasItem[] = [{ id: 'model', ref: { type: 'material', id: 'model-asset' },
    image: { id: 'image', url: '/mock.png', width: 100, height: 200 }, x: 22, y: 11, w: 100,
    assetKind: 'model', createdAt: '2026-11-16T00:00:00.000Z', parentId: 'original' }]
  const items = arrange(input, 'category')
  await source.saveCanvas(project.id, items)
  assert.deepEqual((await source.getProject(project.id))?.items, items)
})
