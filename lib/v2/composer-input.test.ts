import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeAttachments, mentionAt, missingToolFields, readDroppedAttachment, referenceChoices, removeMention, REFERENCE_GROUPS } from './composer-input'
import { createMockDataSource } from './mock'
import type { AgentEvent } from './data-source'
import type { CanvasItem, ChatAttachment } from './types'

const image = { id: 'image-1', url: '/v2-mock/c1.jpg', width: 640, height: 857 }
const attachment: ChatAttachment = { id: 'source-1', kind: 'canvas', label: '源图', image }

test('mention matching is caret-aware and preserves text following the chosen token', () => {
  assert.deepEqual(mentionAt('背景 @商品 后续文本', 6), { kind: '@', query: '商品', start: 3, end: 6 })
  assert.equal(removeMention('背景 @商品 后续文本', { start: 3, end: 6 }), '背景  后续文本')
  assert.equal(mentionAt('mail@example.com', 16), null)
  assert.equal(mentionAt('背景 /换色', 6)?.kind, '/')
  assert.equal(mentionAt('背景 *模特', 6)?.kind, '*')
})
test('all five reference groups are sourced from existing DS lists; missing images remain visible/unselectable', async () => {
  const ds = createMockDataSource()
  const rows = referenceChoices([{ id: 'canvas-1', label: '画布 1', image }], await ds.listProducts(), await ds.listModels(), await ds.listBrandKits(), await ds.listMaterials())
  assert.deepEqual([...new Set(rows.map(row => row.group))], [...REFERENCE_GROUPS])
  assert.equal(rows.find(row => row.group === '品牌')?.attachment?.kind, 'brand')
  assert.ok(rows.some(row => row.group === '商品' && !row.attachment))
  assert.equal(rows[0].attachment?.image.id, image.id)
})
test('multi-file attachments deduplicate by asset identity, preserve order and cap at ten', () => {
  const incoming = Array.from({ length: 12 }, (_, index) => ({ ...attachment, id: `source-${index}`, image: { ...image, id: `image-${index}` } }))
  const result = mergeAttachments([attachment], incoming)
  assert.equal(result.length, 10)
  assert.equal(result[0].label, attachment.label)
  assert.equal(result.filter(row => row.image.id === image.id).length, 1)
})
test('untrusted asset drops reject malformed values and invalid image dimensions', () => {
  assert.equal(readDroppedAttachment('{bad'), undefined)
  assert.equal(readDroppedAttachment(JSON.stringify({ ...attachment, image: { ...image, width: -1 } })), undefined)
  assert.equal(readDroppedAttachment(JSON.stringify({ ...attachment, image: { ...image, url: 'javascript:alert(1)' } })), undefined)
  assert.deepEqual(readDroppedAttachment(JSON.stringify(attachment)), attachment)
})
test('required tool parameters use the same field schema as the canvas toolbar', () => {
  const def = { id: 'try-on', name: '换衣', icon: 'model', surfaces: [], fields: [{ id: 'garment', label: '服装', kind: 'ref' as const }, { id: 'poses', label: '姿势', kind: 'chips' as const, multi: true }] }
  assert.deepEqual(missingToolFields(def, { poses: [] }), ['服装', '姿势'])
  assert.deepEqual(missingToolFields(def, { garment: image, poses: ['front'] }), [])
})
test('mock sends selected count, keeps user attachment identity and links output placeholders to the referenced source', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const ds = createMockDataSource()
  const project = await ds.createProject({})
  const source: CanvasItem = { id: 'source-node', ref: { type: 'material', id: image.id }, image, x: 0, y: 0, w: 150 }
  await ds.saveCanvas(project.id, [source])
  const events: AgentEvent[] = []
  const running = ds.sendMessage(project.id, { text: '八张商品图', attachments: [attachment], mode: 'agent', generation: { modelId: 'nano-banana-2', ratio: '3:4', resolution: '2k', count: 8 } }, event => events.push(event))
  // Each completion schedules the next delay; advance between microtask turns.
  for (let index = 0; index < 14; index++) { t.mock.timers.tick(20_000); await Promise.resolve() }
  await running
  const user = events.find(event => event.type === 'message' && event.message.role === 'user')
  assert.ok(user?.type === 'message' && user.message.role === 'user')
  assert.deepEqual(user.message.attachments, [attachment])
  const added = events.filter(event => event.type === 'item-add')
  assert.equal(added.length, 8)
  for (const event of added) if (event.type === 'item-add') { assert.equal(event.item.parentId, source.id); assert.deepEqual(event.item.placeholder, image) }
  // G6 emits progress updates as well as the terminal update for each output.
  const completed = events.filter(event => event.type === 'item-update').filter(event => event.patch.status === 'done')
  assert.equal(completed.length, 8)
  assert.deepEqual(completed.map(event => event.id).sort(), added.map(event => event.item.id).sort())
  assert.ok(completed.every(event => event.patch.image?.url))
  assert.equal(events.at(-1)?.type, 'done')
})
