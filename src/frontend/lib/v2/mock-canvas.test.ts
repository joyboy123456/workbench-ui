import assert from 'node:assert/strict'
import test from 'node:test'
import { createStressCanvas } from './mock-canvas'
import { createMockDataSource } from './mock'
import { itemCategory } from './arrange'
import type { CanvasItem } from './types'

const source: CanvasItem = {
  id: 'original', ref: { type: 'material', id: 'original-asset' },
  image: { id: 'original-image', url: '/v2-mock/c1.jpg', width: 640, height: 857 },
  x: 20, y: 40, w: 100, status: 'running', toolRunId: 'original-run', parentId: 'original-parent',
}

test('stress fixture creates 300 local images in four categories without copying live task state', () => {
  const before = structuredClone(source)
  const items = createStressCanvas([source])
  assert.equal(items.length, 300)
  assert.equal(new Set(items.map(item => item.id)).size, 300)
  for (const category of ['product', 'model', 'generation', 'material']) assert.equal(items.filter(item => itemCategory(item) === category).length, 75)
  assert.ok(items.every(item => item.image === source.image && !item.toolRunId && !item.status && !item.parentId))
  assert.deepEqual(source, before)
  assert.equal(createStressCanvas([]).length, 300)
})

test('development query uses isolated mock save/load; ordinary mock and production ignore the fixture', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldEnvironment = process.env.NODE_ENV
  const location = { search: '' }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } })
  Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, enumerable: true, writable: true, value: 'development' })
  try {
    const mock = createMockDataSource()
    const project = await mock.createProject({ name: '300 节点隔离' })
    await mock.saveCanvas(project.id, [source])
    location.search = '?mockNodes=300'
    const stress = await mock.getProject(project.id)
    assert.equal(stress?.items.length, 300)
    const changed = stress?.items.map(item => ({ ...item, x: 900 })) ?? []
    await mock.saveCanvas(project.id, changed)
    assert.deepEqual((await mock.getProject(project.id))?.items, changed)
    location.search = ''
    assert.deepEqual((await mock.getProject(project.id))?.items, [source])
    location.search = '?mockNodes=300'
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, enumerable: true, writable: true, value: 'production' })
    assert.deepEqual((await mock.getProject(project.id))?.items, [source])
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (oldEnvironment === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
    else Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, enumerable: true, writable: true, value: oldEnvironment })
  }
})
