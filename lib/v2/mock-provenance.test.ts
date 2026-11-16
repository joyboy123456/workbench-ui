import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource } from './mock'
import type { AgentEvent } from './data-source'
import type { CanvasItem } from './types'
import { provenanceLinks } from './provenance'

const source: CanvasItem = { id: 'source', ref: { type: 'material', id: 'image' }, image: { id: 'image', url: '/v2-mock/c1.jpg', width: 640, height: 857 }, x: 40, y: 60, w: 150 }

test('mock multi-output placeholders, completion and a fresh adapter preserve provenance and layout', async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const ds = createMockDataSource({ storage, pause: async () => {} })
  const project = await ds.createProject({ name: '溯源测试' })
  const reference = { ...source, id: 'reference', image: { ...source.image, id: 'ref-image' }, x: 350 }
  await ds.saveCanvas(project.id, [source, reference])
  const events: AgentEvent[] = []
  await ds.runTool(project.id, 'swap-bg', [source.id], event => events.push(event), { n: '4', ref: reference.image })
  const added = events.flatMap(event => event.type === 'item-add' ? [event.item] : [])
  assert.equal(added.length, 4)
  assert.equal(new Set(added.map(item => item.toolRunId)).size, 1)
  assert.ok(added[0].toolRunId)
  for (const item of added) {
    assert.equal(item.status, 'running')
    assert.deepEqual(item.parentIds, ['source', 'reference'])
    assert.equal(item.y, source.y)
    assert.ok(item.x > reference.x + reference.w)
  }
  const fresh = await createMockDataSource({ storage }).getProject(project.id)
  assert.ok(fresh)
  assert.equal(provenanceLinks(fresh.items).length, 8)
  for (const item of added) {
    const done: CanvasItem | undefined = fresh.items.find(value => value.id === item.id)
    assert.equal(done?.status, 'done')
    assert.deepEqual([done?.x, done?.y, done?.w], [item.x, item.y, item.w])
    assert.equal(done?.toolRunId, item.toolRunId)
  }
})

test('mock chat references use the same parent and placement contract', async () => {
  const ds = createMockDataSource({ pause: async () => {} })
  const project = await ds.createProject({})
  await ds.saveCanvas(project.id, [source])
  const added: CanvasItem[] = []
  await ds.sendMessage(project.id, { text: '四张主图', mode: 'direct', attachments: [{ kind: 'canvas', id: source.id, label: '商品', image: source.image }] }, event => {
    if (event.type === 'item-add') added.push(event.item)
  })
  assert.equal(added.length, 4)
  assert.ok(added.every(item => item.parentIds?.[0] === source.id && item.y === source.y && item.x > source.x + source.w))
})

test('refreshing an interrupted mock run keeps its slot and ancestry without resubmission', async () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const ds = createMockDataSource({ storage })
  const project = await ds.createProject({})
  const output: CanvasItem = { ...source, id: 'interrupted', x: 500, parentIds: [source.id], toolRunId: 'local-run', status: 'running' }
  await ds.saveCanvas(project.id, [source, output])
  const restored = (await createMockDataSource({ storage }).getProject(project.id))?.items[1]
  assert.equal(restored?.x, 500)
  assert.deepEqual(restored?.parentIds, [source.id])
  assert.equal(restored?.status, 'failed')
  assert.equal(restored?.retryAllowed, false)
})

test('batch tools keep separate source families while fusion keeps every source', async () => {
  const ds = createMockDataSource({ pause: async () => {} })
  const project = await ds.createProject({})
  const other = { ...source, id: 'other-source', y: 500 }
  await ds.saveCanvas(project.id, [source, other])
  const added: CanvasItem[] = []
  await ds.runTool(project.id, 'swap-bg', [source.id, other.id], event => {
    if (event.type === 'item-add') added.push(event.item)
  }, { n: '2' })
  assert.equal(added.length, 4)
  assert.equal(new Set(added.map(item => item.toolRunId)).size, 1)
  for (const parent of [source, other]) {
    const children = added.filter(item => item.parentIds?.[0] === parent.id)
    assert.equal(children.length, 2)
    assert.ok(children.every(item => item.parentIds?.length === 1 && item.y === parent.y))
    assert.ok(children[1].x > children[0].x + children[0].w)
  }
  const fused: CanvasItem[] = []
  await ds.runTool(project.id, 'fuse', [source.id, other.id], event => {
    if (event.type === 'item-add') fused.push(event.item)
  })
  assert.ok(fused.length > 0)
  assert.ok(fused.every(item => item.parentIds?.join(',') === `${source.id},${other.id}`))
})
