import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource } from './mock'
import type { CanvasItem } from './types'

const node: CanvasItem = { id: 'valid-node', ref: { type: 'material', id: 'asset' }, image: { id: 'image', url: '/v2-mock/c1.jpg', width: 100, height: 100 }, x: 0, y: 0, w: 100 }
const project = (id: string) => ({ id, name: id, productIds: [], updatedAt: '2026-11-16T00:00:00.000Z' })

test('one corrupt project or node cannot discard healthy projects and messages', async () => {
  const snapshot = JSON.stringify([
    { project: project('healthy'), items: [node], messages: [] },
    { project: null, items: [], messages: [] },
    { project: project('partial'), items: [{ ...node, id: 'bad', w: -1 }, node], messages: [{ invalid: true }] },
  ])
  const warnings: unknown[][] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const ds = createMockDataSource({ storage: { getItem: (key = 'v2:mock-projects:v1') => key === 'v2:mock-projects:v1' ? snapshot : null, setItem() {} } })
    assert.deepEqual((await ds.getProject('healthy'))?.items, [node])
    assert.deepEqual((await ds.getProject('partial'))?.items, [node])
    assert.ok(warnings.length >= 3)
  } finally { console.warn = warn }
})

test('quota failures tell the caller that this change is not saved', async () => {
  const ds = createMockDataSource({ storage: { getItem: () => null, setItem() { throw new DOMException('quota', 'QuotaExceededError') } } })
  await assert.rejects(ds.createProject({ name: '容量不足' }), /本地存储空间不足.*未保存/)
})

test('uploaded image survives a new adapter without storing image bytes in localStorage', async () => {
  let snapshot: string | null = null
  const storage = { getItem: (key = 'v2:mock-projects:v1') => key === 'v2:mock-projects:v1' ? snapshot : null, setItem(key: string, value: string) { if (key === 'v2:mock-projects:v1') snapshot = value } }
  const blobs = new Map<string, Blob>()
  const images = { async put(id: string, blob: Blob) { blobs.set(id, blob) }, async get(id: string) { return blobs.get(id) } }
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  class DecodedImage {
    naturalWidth = 800
    naturalHeight = 600
    onload?: () => void
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: DecodedImage })
  try {
    const first = createMockDataSource({ storage, images })
    const project = await first.createProject({ name: '刷新原图' })
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(42)
    const attachment = await first.uploadChatAttachment!(new File([bytes], 'photo.png', { type: 'image/png' }))
    await first.saveCanvas(project.id, [{ ...node, image: attachment.image }], [{ id: 'user', role: 'user', text: '这张图片', attachments: [attachment], createdAt: '2026-11-16T00:00:00.000Z' }])
    assert.ok((storage.getItem()?.length ?? Infinity) < 100_000)
    assert.doesNotMatch(snapshot ?? '', /data:image|blob:/)
    const second = createMockDataSource({ storage, images })
    const loaded = await second.getProject(project.id)
    assert.equal(loaded?.items.length, 1)
    assert.equal(loaded?.messages.length, 1)
    assert.equal(loaded?.items[0].image.width, 800)
    assert.notEqual(loaded?.items[0].image.url, attachment.image.url)
    const restored = await fetch(loaded!.items[0].image.url).then(response => response.arrayBuffer())
    assert.deepEqual(new Uint8Array(restored), bytes)
    await second.saveCanvas(project.id, loaded!.items, loaded!.messages)
    assert.doesNotMatch(snapshot ?? '', /data:image|blob:/)
  } finally {
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage)
    else Reflect.deleteProperty(globalThis, 'Image')
  }
})

test('legacy data URLs migrate and missing stored blobs only discard their own node', async () => {
  let snapshot = JSON.stringify([{ project: project('legacy'), items: [node, { ...node, id: 'inline', image: { ...node.image, url: 'data:image/png;base64,aGVsbG8=' } }, { ...node, id: 'missing', image: { ...node.image, url: '/__v2_mock_image/missing' } }], messages: [] }])
  const blobs = new Map<string, Blob>()
  const ds = createMockDataSource({
    storage: { getItem: (key = 'v2:mock-projects:v1') => key === 'v2:mock-projects:v1' ? snapshot : null, setItem(key, value) { if (key === 'v2:mock-projects:v1') snapshot = value } },
    images: { async put(id, blob) { blobs.set(id, blob) }, async get(id) { return blobs.get(id) } },
  })
  const loaded = await ds.getProject('legacy')
  assert.deepEqual(loaded?.items.map(item => item.id), ['valid-node', 'inline'])
  assert.equal(await fetch(loaded!.items[1].image.url).then(response => response.text()), 'hello')
  await ds.saveCanvas('legacy', loaded!.items)
  assert.doesNotMatch(snapshot ?? '', /data:image|blob:/)
})
