import assert from 'node:assert/strict'
import test from 'node:test'
import { generationDisplay, generationTarget, mergeGenerationItem } from './generation-progress'
import { itemHeight } from './arrange'
import { createMockDataSource } from './mock'
import type { AgentEvent } from './data-source'
import type { CanvasItem } from './types'
import { canvasItemSchema, chatMessageSchema } from '@/lib/v2/project-schema'

const start = Date.parse('2026-11-16T00:00:00.000Z')
const item: CanvasItem = { id: 'output', ref: { type: 'generation', id: 'result' }, image: { id: 'image', url: '/image.png', width: 1000, height: 1000 }, x: 40, y: 50, w: 150, status: 'running', startedAt: new Date(start).toISOString(), estimatedDurationMs: 30_000 }

test('queued/processing/uncertain stay honest; estimates never reach completion or move backwards', () => {
  assert.equal(generationDisplay({ ...item, generationPhase: 'queued' }, start + 30_000).label, '排队中')
  const first = generationDisplay(item, start + 10_000)
  assert.equal(first.estimated, true)
  assert.equal(generationDisplay({ ...item, progress: 3 }, start + 15_000, first).percent, first.percent)
  assert.equal(generationDisplay({ ...item, progress: 3 }, start + 15_000, first).estimated, true)
  assert.equal(generationDisplay({ ...item, progress: 90 }, start + 15_000, first).estimated, false)
  assert.equal(generationDisplay(item, start + 999_999).percent! < 100, true)
  assert.equal(generationDisplay({ ...item, generationPhase: 'unconfirmed' }, start).percent, undefined)
  assert.equal(generationDisplay({ ...item, generationPhase: 'processing' }, start).label, '处理中')
  assert.equal(generationDisplay({ ...item, status: 'done' }, start).percent, 100)
  assert.equal(generationDisplay({ ...item, status: 'failed' }, start).percent, undefined)
  assert.equal(generationDisplay({ ...item, startedAt: new Date(start + 20_000).toISOString(), progress: 8 }, start + 20_000, first).percent, 8)
})

test('target ratios, expand padding and upscale dimensions freeze geometry through replacement', () => {
  assert.deepEqual(generationTarget(item.image, 'outpaint', { ratio: '16:9' }), { width: 1792, height: 1008 })
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
  await source.sendMessage(project.id, { text: '商品主图', attachments: [], mode: 'direct' }, event => events.push(event))
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
