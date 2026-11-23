import assert from 'node:assert/strict'
import test from 'node:test'
import { generationDisplay, generationTarget, mergeGenerationItem } from './generation-progress'
import { itemHeight } from './arrange'
import { createMockDataSource } from './mock'
import type { AgentEvent } from './data-source'
import type { CanvasItem } from './types'
import { canvasItemSchema, chatMessageSchema } from './project-schema'

const start = Date.parse('2026-11-16T00:00:00.000Z')
const item: CanvasItem = { id: 'output', ref: { type: 'generation', id: 'result' }, image: { id: 'image', url: '/image.png', width: 1000, height: 1000 }, x: 40, y: 50, w: 150, status: 'running', startedAt: new Date(start).toISOString(), estimatedDurationMs: 30_000 }

test('generation display reports lifecycle facts without converting timing or provider samples into completion', () => {
  assert.deepEqual(generationDisplay({ ...item, generationPhase: 'queued' }), { label: '排队中' })
  assert.deepEqual(generationDisplay(item), { label: '生成中' })
  const reported = { ...item, progress: 100 }
  assert.deepEqual(generationDisplay(reported), { label: '生成中' })
  assert.deepEqual(generationDisplay({ ...item, generationPhase: 'unconfirmed' }), { label: '状态待确认' })
  assert.deepEqual(generationDisplay({ ...item, generationPhase: 'processing' }), { label: '处理中' })
  assert.deepEqual(generationDisplay({ ...item, status: 'done' }), { label: '已完成' })
  assert.deepEqual(generationDisplay({ ...item, status: 'failed' }), { label: '生成失败' })
})

test('target ratios, expand padding and upscale dimensions freeze geometry through replacement', () => {
  assert.deepEqual(generationTarget(item.image, 'outpaint', { ratio: '16:9' }), { width: 1024, height: 576 })
  assert.deepEqual(generationTarget({ width: 100, height: 80 }, 'outpaint', { ratio: 'original', scale: 2, imageSize: '2K' }), { width: 2048, height: 1640 })
  assert.deepEqual(generationTarget(item.image, 'outpaint', { padLeft: 32, padBottom: 64 }), { width: 1320, height: 1640 })
  assert.deepEqual(generationTarget(item.image, 'upscale:4x'), { width: 4096, height: 4096 })
  const before = { ...item, progress: 60, targetSize: { width: 1600, height: 900 } }
  const after = mergeGenerationItem(before, { status: 'done', image: { ...item.image, width: 1024, height: 1024 }, progress: 40 })
  assert.equal(itemHeight(after), itemHeight(before))
  assert.equal(after.x, before.x)
  assert.equal(after.w, before.w)
  assert.equal(after.progress, 60)
  const retry = mergeGenerationItem(before, { startedAt: new Date(start + 60_000).toISOString(), generationPhase: 'queued' })
  assert.equal(retry.progress, undefined, 'a new attempt cannot inherit a previous high-water mark')
  assert.deepEqual(retry.targetSize, before.targetSize)
  assert.equal(canvasItemSchema.safeParse(after).success, true)
  assert.equal(chatMessageSchema.safeParse({ id: 'a', role: 'assistant', createdAt: item.startedAt, steps: [{ itemId: item.id, label: '第 1 张', icon: 'image' }], results: [] }).success, true)
})

test('mock emits independent queue/progress/processing/success/failure and retries only the failed output', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network forbidden') })
  const source = createMockDataSource({ pause: async () => {}, failOutputIndex: 1 })
  const project = await source.createProject({})
  const events: AgentEvent[] = []
  await source.sendMessage(project.id, { text: '商品主图', attachments: [], mode: 'image' }, event => events.push(event))
  const added = events.filter(event => event.type === 'item-add')
  assert.equal(added.length, 4)
  assert.equal(added.every(event => event.item.generationPhase === 'queued'), true)
  const changes = events.filter(event => event.type === 'item-update')
  assert.equal(changes.some(event => event.patch.generationPhase === 'generating'), true)
  assert.equal(changes.some(event => event.patch.generationPhase === 'processing'), true)
  assert.equal(changes.filter(event => event.patch.status === 'done').length, 3)
  const failure = changes.find(event => event.patch.status === 'failed')
  assert.ok(failure?.patch.errorMessage)
  const firstDone = events.findIndex(event => event.type === 'item-update' && event.patch.status === 'done')
  const lastTerminal = events.findLastIndex(event => event.type === 'item-update' && ['done', 'failed'].includes(event.patch.status ?? ''))
  assert.ok(firstDone < lastTerminal, 'each output completes before the batch settles')
  const snapshot = await source.getProject(project.id)
  assert.equal(snapshot?.items.length, 4)
  assert.ok(snapshot?.messages.some(message => message.role === 'assistant' && message.steps.every(step => step.itemId)))
  const runId = added[0].item.toolRunId!
  const retried: AgentEvent[] = []
  await source.retryToolRun!(project.id, runId, event => retried.push(event))
  assert.equal(retried.some(event => event.type === 'item-add'), false)
  assert.equal(retried.filter(event => event.type === 'item-update' && event.patch.status === 'done').length, 1)
  assert.equal(retried.filter(event => event.type === 'item-update').every(event => event.id === failure.id), true)
  assert.equal((await source.getProject(project.id))?.items.every(item => item.status === 'done'), true)
})
