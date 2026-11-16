import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource } from './mock'
import type { CanvasItem } from './types'

test('mock 封面和全部来源素材可重读，未完成图片拒绝保存', async () => {
  const ds = createMockDataSource()
  const project = await ds.createProject({})
  const image = { id: 'img', url: '/v2-mock/c1.jpg', width: 100, height: 200 }
  const item: CanvasItem = { id: 'ci', image, ref: { type: 'material', id: 'uploaded' }, x: 0, y: 0, w: 100 }
  await ds.saveCanvas(project.id, [item])
  assert.equal((await ds.setProjectCover(project.id, item.id)).coverItemId, item.id)
  await ds.saveCanvas(project.id, [item])
  assert.equal((await ds.getProject(project.id))?.project.cover?.id, image.id)
  const material = await ds.saveCanvasMaterial(project.id, item.id)
  assert.equal((await ds.saveCanvasMaterial(project.id, item.id)).id, material.id)
  assert.ok((await ds.listMaterials()).some(m => m.id === material.id))
  await ds.saveCanvas(project.id, [{ ...item, status: 'running' }])
  await assert.rejects(ds.setProjectCover(project.id, item.id))
  await assert.rejects(ds.saveCanvasMaterial(project.id, item.id))
})
