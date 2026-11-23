import assert from 'node:assert/strict'
import test from 'node:test'
import { pendingMessage, advancePending, canSendMessage } from './pending-message'

const draft = { text: '商品主图', attachments: [{ id: 'product' }, { id: 'model' }] }
const ready = { project: true, channel: true, busy: false, active: false }
test('project/channel recovery and active turn queue the entire draft without consuming it', () => {
  for (const blocked of [{ project: false }, { channel: false }, { busy: true }, { active: true }]) {
    const queue = pendingMessage(draft, 0)
    const next = advancePending(queue, { ...ready, ...blocked }, 1)
    assert.equal(next.state.status, 'queued')
    assert.equal(next.action, 'wait')
    assert.equal(next.state.draft, draft)
    assert.equal(canSendMessage({ ...ready, ...blocked }), false)
  }
})
test('recovery claims exactly one send even across repeated effects and while sending', () => {
  let queue = pendingMessage(draft, 0)
  queue = advancePending(queue, { ...ready, channel: false }, 1).state
  const next = advancePending(queue, ready, 2)
  assert.equal(next.action, 'send')
  for (let i = 0; i < 10; i++) assert.equal(advancePending(next.state, ready, 3).action, 'wait')
  const done = advancePending(next.state, ready, 4, 'sent')
  assert.equal(done.state.status, 'sent')
  assert.equal(advancePending(done.state, ready, 5).action, 'wait')
})
test('readiness timeout or failure emits one error and retains text and every attachment', () => {
  for (const error of [undefined, '恢复失败']) {
    const next = advancePending(pendingMessage(draft, 0), { ...ready, channel: false, error }, 30_000)
    assert.equal(next.action, 'fail')
    assert.equal(next.state.status, 'failed')
    assert.equal(next.state.draft, draft)
    assert.match(next.state.error ?? '', /未发送，已保留草稿/)
    assert.equal(advancePending(next.state, ready, 30_001).action, 'wait')
  }
})
test('a failed submission retains the draft and never automatically retries an unknown POST', () => {
  const sending = advancePending(pendingMessage(draft, 0), ready, 1).state
  assert.equal(advancePending(sending, ready, 60_000).action, 'wait', 'readiness timeout must not resubmit an in-flight request')
  const failure = advancePending(sending, ready, 60_001, 'failed')
  assert.equal(failure.action, 'fail')
  assert.equal(failure.state.draft, draft)
  assert.equal(advancePending(failure.state, ready, 60_002).action, 'wait')
})

test('saved optimistic bubble and mock send merge by ID before persistence', async () => {
  const { createMockDataSource } = await import('./mock')
  const ds = createMockDataSource({ pause: async () => {} })
  const project = await ds.createProject({})
  const createdAt = '2026-11-16T00:00:00.000Z'
  const input = { clientMessageId: 'home-message', text: '不确定用什么风格', mode: 'image' as const, generation: { modelId: 'nano-banana-2.1', ratio: '3:4', resolution: '2k', count: 2 }, attachments: [] }
  await ds.saveCanvas(project.id, [], [{ id: input.clientMessageId, role: 'user', text: input.text, attachments: [], createdAt }])
  await ds.sendMessage(project.id, input, () => {})
  const saved = await ds.getProject(project.id)
  assert.equal(saved?.messages.filter(message => message.id === input.clientMessageId).length, 1)
  const persisted = saved?.messages.find(message => message.id === input.clientMessageId)
  assert.equal(persisted?.createdAt, createdAt)
  assert.ok(persisted?.role === 'user')
  assert.equal(persisted.mode, 'image')
  assert.deepEqual(persisted.generation, input.generation)
})
