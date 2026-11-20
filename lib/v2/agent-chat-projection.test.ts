import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentBetaMessageReceipt, AgentBetaSession } from '@/lib/agent-beta/types'
import type { AgentRunEvent } from '@/lib/agent/run-timeline'
import type { Phase1PhotoSlotView } from '@/lib/agent/phase1-photo-delivery-contract'
import { chatMessagesSchema } from './project-schema'
import { agentSnapshotEvents, projectAgentChat } from './agent-chat-projection'
import { emptyAgentImage, type AgentChatSubmission } from './agent-chat-contract'

const date = '2026-11-16T00:00:00.000Z'
const receipt: AgentBetaMessageReceipt = { version: 'message-receipt-v1', projectId: 'session', clientMessageId: 'user', runId: 'run', state: 'accepted' }
const submission: AgentChatSubmission = { clientMessageId: 'user', text: '改成红色', mode: 'agent', createdAt: date,
  attachments: [{ kind: 'canvas', id: 'canvas-input', label: '图 1', image: { id: 'input', url: '/input.png', width: 768, height: 1024 } }] }
const source: AgentBetaSession = {
  id: 'session', title: '项目', createdAt: date, updatedAt: date,
  nodes: [{ id: 'input-node', assetId: 'input', name: '商品', url: '/input.png', width: 768, height: 1024, x: 0, y: 0 }],
  messages: [
    { id: 'user', role: 'user', content: '改成红色', referenceNodeIds: ['input-node'], createdAt: date },
    { id: 'run', role: 'assistant', content: '正在创作…', referenceNodeIds: ['input-node'], createdAt: date },
  ],
}
const slot: Phase1PhotoSlotView = { batchId: 'batch', slotId: 'slot', slotIndex: 1, attemptNumber: 1,
  automaticRetryLimit: 0, automaticRetriesUsed: 0, state: 'generating' }
const events: AgentRunEvent[] = [{ schemaVersion: 1, name: 'slot.updated', runId: 'run', sequence: 1,
  loop: 1, phase: 'execution', status: 'started', summary: '生成中', occurredAt: date,
  slot: { batchId: 'batch', slotId: 'slot', state: 'generating', attemptNumber: 1, occurredAt: date } }]

test('a previously uncertain turn shows its recovered delivery without rewriting historical turn outcome', () => {
  const session = structuredClone(source)
  session.nodes.push({ id: 'result-node', assetId: 'result', taskId: 'task', name: '白底图', url: '/result.png', width: 768, height: 1024, x: 0, y: 0 })
  const failure = { category: 'acceptance_unknown', code: 'unclassified_error', receiptState: 'unknown', retryable: false } as const
  session.messages[1] = { ...session.messages[1], failure, content: '本次任务状态需要核实，请稍后刷新；不会重复生成。', turnOutcome: 'failed',
    plan: { id: 'plan', prompt: '换白底', referenceNodeIds: ['input-node'], status: 'submitted',
      settings: { model: 'nano-banana-2.1', imageRatio: '3:4', resolution: '1k', referenceSearchMode: 'shop' },
      task: { taskId: 'task', status: 'success', progress: 100, message: '生成完成' }, resultAdmission: { state: 'admitted', taskId: 'task', resultCount: 1 } } }
  const snapshot = projectAgentChat(session, [submission], [{ ...receipt, state: 'settled', turnOutcome: 'failed' }])
  const message = snapshot.messages[1]
  assert.ok(message.role === 'assistant')
  assert.equal(snapshot.items[0].status, 'done')
  assert.equal(message.failure, undefined)
  assert.equal(session.messages[1].failure, failure)
  const stale = { ...message, failure }
  const replacement = agentSnapshotEvents({ ...snapshot, messages: [stale] }, snapshot).find(e => e.type === 'message' && e.message.id === message.id)
  assert.ok(replacement, '恢复时用完整消息替换旧诊断')
  assert.match(message.body ?? '', /已核实并交付/)
  assert.match(message.body ?? '', /规格：3:4 · 768 × 1024 像素/)
  assert.equal(message.meta?.spec, '3:4 · 768 × 1024 像素')
  assert.equal(message.meta?.suggestions?.length, 3)
  assert.match(message.meta?.risks?.join('') ?? '', /人工视觉验收/)
  assert.ok(message.steps.some(step => step.label === '已完成'))
  assert.ok(!message.steps.some(step => step.label === '本轮处理失败'))
  assert.equal(session.messages[1].turnOutcome, 'failed')
  session.nodes.pop()
  const revoked = projectAgentChat(session, [submission], [{ ...receipt, state: 'settled', turnOutcome: 'failed' }]).messages[1]
  assert.ok(revoked.role === 'assistant')
  assert.deepEqual(revoked.failure, failure)
  assert.doesNotMatch(revoked.body ?? '', /已核实并交付/)
})

// Synthetic recording: accepted -> tool status -> output slot -> admitted -> revoked.
// No runtime, provider, HTTP, database or image generation is invoked.
test('recorded stream maps messages, tool state, placeholders and admitted images in order', () => {
  const accepted = projectAgentChat(source, [submission], [receipt])
  assert.deepEqual(agentSnapshotEvents(undefined, accepted).map(event => event.type), ['message', 'message'])
  const generating = projectAgentChat({ ...source, photoSlots: [slot] }, [submission], [receipt], events)
  assert.deepEqual(agentSnapshotEvents(accepted, generating).map(event => event.type), ['message-update', 'item-add'])
  assert.equal(generating.items[0].placeholder?.id, 'input')
  assert.equal(generating.items[0].parentId, 'canvas-input')
  assert.deepEqual(generating.items[0].targetSize, { width: 768, height: 1024 })
  assert.equal(generating.items[0].generationPhase, 'generating')
  const generatingMessage = generating.messages.find(message => message.role === 'assistant')
  assert.ok(generatingMessage?.role === 'assistant')
  assert.equal(generatingMessage.steps.at(-1)?.itemId, generating.items[0].id)
  const completedSession: AgentBetaSession = { ...source,
    nodes: [...source.nodes, { id: 'result-node', assetId: 'result', taskId: 'task', name: '结果', url: '/result.png', width: 768, height: 1024, x: 0, y: 0 }],
    photoSlots: [{ ...slot, state: 'admitted', imageRef: { assetId: 'result', taskId: 'task', nodeId: 'result-node' } }],
    messages: source.messages.map(message => message.role === 'assistant' ? { ...message, content: '已完成', turnOutcome: 'completed' } : message),
  }
  const completed = projectAgentChat(completedSession, [submission], [{ ...receipt, state: 'settled', turnOutcome: 'completed' }], events)
  assert.deepEqual(agentSnapshotEvents(generating, completed).map(event => event.type), ['message-update', 'item-update', 'done'])
  assert.equal(completed.items[0].id, generating.items[0].id)
  assert.equal(completed.items[0].ref.id, 'result')
  assert.deepEqual(completed.items[0].targetSize, generating.items[0].targetSize)
  assert.deepEqual(agentSnapshotEvents(completed, completed), [])
  assert.deepEqual(projectAgentChat(completedSession, [submission], [{ ...receipt, state: 'settled', turnOutcome: 'completed' }], events), completed)
})

test('an admitted event alone never publishes an image; missing authorized node fails closed', () => {
  const snapshot = projectAgentChat({ ...source, photoSlots: [{ ...slot, state: 'admitted', imageRef: { assetId: 'missing', nodeId: 'missing', taskId: 'task' } }] }, [], [{ ...receipt, state: 'settled' }], events)
  assert.equal(snapshot.items[0].status, 'failed')
  assert.deepEqual(snapshot.items[0].image, emptyAgentImage)
  assert.equal(snapshot.messages.find(message => message.role === 'assistant')?.role, 'assistant')
})

test('stopped turn still observes submitted outputs; unverifiable result never remains spinning', () => {
  const stopped = { ...source, messages: source.messages.map(message => message.role === 'assistant' ? { ...message, turnOutcome: 'stopped' as const } : message) }
  const running = projectAgentChat({ ...stopped, photoSlots: [slot] }, [], [{ ...receipt, state: 'settled', turnOutcome: 'stopped' }], events)
  assert.equal(running.active, true)
  const failed = projectAgentChat({ ...stopped, photoSlots: [{ ...slot, state: 'unverifiable', reason: { code: 'result_connection_lost', nextStep: '结果无法核实，请人工确认', canManualReshoot: true } }] }, [], [{ ...receipt, state: 'settled', turnOutcome: 'stopped' }], events)
  assert.equal(failed.active, false)
  assert.equal(failed.items[0].status, 'failed')
  assert.equal(failed.items[0].retryAllowed, false)
  assert.equal(failed.items[0].errorMessage, '结果无法核实，请人工确认')
  const reply = failed.messages.find(message => message.role === 'assistant')
  assert.ok(reply?.role === 'assistant')
  assert.match(reply.steps.map(step => step.label).join(' '), /结果无法核实/)
  assert.equal(agentSnapshotEvents(running, failed).at(-1)?.type, 'done')
})

test('replayed updates clear revoked media without resetting user coordinates', () => {
  const previous = projectAgentChat({ ...source, photoSlots: [slot] }, [], [receipt], events)
  previous.items[0] = { ...previous.items[0], image: { id: 'old', url: '/old.png', width: 10, height: 20 }, status: 'done', x: 100, y: 300, w: 50 }
  const next = projectAgentChat({ ...source, photoSlots: [{ ...slot, state: 'manual_review', reason: { code: 'post_admission_recheck_failed', nextStep: '等待核对', canManualReshoot: false } }] }, [], [{ ...receipt, state: 'settled' }], events)
  const update = agentSnapshotEvents(previous, next).find(event => event.type === 'item-update')
  assert.ok(update?.type === 'item-update')
  assert.equal(update.patch.image?.id, emptyAgentImage.id)
  assert.equal(update.patch.status, 'failed')
  assert.equal('x' in update.patch, false)
  assert.equal('w' in update.patch, false)
})

test('PI action status provides real output count and tool status without guessing from text', () => {
  const session = structuredClone(source)
  session.messages[1].piRun = { runtime: 'pi-agent-v1', actions: [{ actionId: 'action', capabilityId: 'image', label: '商品主图', state: 'pending', admission: 'pending', expectedResultCount: 2, resultCount: 0 }] }
  const snapshot = projectAgentChat(session, [submission], [receipt])
  assert.equal(snapshot.items.length, 2)
  assert.equal(snapshot.items.every(item => item.generationPhase === 'queued'), true)
  const assistant = snapshot.messages.find(message => message.role === 'assistant')
  assert.ok(assistant?.role === 'assistant')
  assert.match(assistant.steps[0].label, /排队中/)
})

test('agent sibling results retain all input references and saved positions on refresh', () => {
  const session = structuredClone(source)
  session.messages[1].piRun = { runtime: 'pi-agent-v1', actions: [{ actionId: 'action', capabilityId: 'image', label: '商品主图', state: 'pending', admission: 'pending', expectedResultCount: 4, resultCount: 0 }] }
  const canvas = submission.attachments.map(attachment => ({ id: attachment.id, image: attachment.image, ref: { type: 'material' as const, id: attachment.image.id }, x: 100, y: 90, w: 150 }))
  const first = projectAgentChat(session, [submission], [receipt], [], canvas)
  assert.ok(first.items.every(item => item.parentIds?.[0] === canvas[0].id && item.toolRunId === 'run' && item.y === 90 && item.x > 250))
  const saved = first.items.map(item => ({ ...item, x: item.x + 800, y: 600 }))
  const refreshed = projectAgentChat(session, [submission], [receipt], [], [...canvas, ...saved])
  assert.deepEqual(refreshed.items, saved)
})

test('one admitted photo replaces its frame while sibling verification continues', () => {
  const snapshot = projectAgentChat({ ...source,
    nodes: [...source.nodes, { id: 'output', assetId: 'asset', taskId: 'task', url: '/output.png', name: '结果', width: 1024, height: 1024, x: 0, y: 0 }],
    photoSlots: [
      { ...slot, state: 'admitted', imageRef: { nodeId: 'output', assetId: 'asset', taskId: 'task' } },
      { ...slot, slotId: 'second', slotIndex: 2, state: 'verifying',
        reason: { code: 'local_result_verification_pending', nextStep: '正在核实结果', canManualReshoot: false } },
    ],
  }, [submission], [receipt], events)
  assert.deepEqual(snapshot.items.map(item => item.status), ['done', 'running'])
  assert.equal(snapshot.items[1].generationPhase, 'processing')
  assert.equal(snapshot.items[0].image.width, 1024)
  assert.deepEqual(snapshot.items[0].targetSize, { width: 768, height: 1024 })
})

test('理解超时保留可重试状态和文案，已终止会话不再标为运行中', () => {
  const session: AgentBetaSession = { ...source, messages: source.messages.map(message => message.role === 'assistant'
    ? { ...message, content: '理解服务响应超时，请保留本轮要求重试。', retryable: true, turnOutcome: 'failed' } : message) }
  const projected = projectAgentChat(session, [submission], [{ ...receipt, state: 'settled', turnOutcome: 'failed' }])
  assert.deepEqual(chatMessagesSchema.parse(projected.messages), projected.messages)
  const message = projected.messages.find(message => message.role === 'assistant')
  assert.ok(message?.role === 'assistant' && message.retryable)
  assert.match(message.body!, /响应超时.*重试/)
  assert.equal(projected.active, false)
})

test('外链案例成为账号素材后，快照仍投影压缩展示图，保留原资产身份', () => {
  const original = 'https://image.yibaiaigc.com/original.png'
  const session = { ...source, nodes: [{ ...source.nodes[0], url: original }] }
  const snapshot = projectAgentChat(session, [submission], [receipt])
  const user = snapshot.messages.find(message => message.role === 'user')
  assert.ok(user?.role === 'user')
  const image = user.attachments?.[0].image
  assert.ok(image)
  assert.equal(image.id, 'input')
  assert.equal(new URL(image.url).searchParams.get('x-oss-process'), 'image/resize,l_1600/quality,q_82/format,webp')
  assert.equal(new URL(image.thumbUrl!).searchParams.get('x-oss-process'), 'image/resize,w_400/quality,q_80/format,webp')
  assert.equal(image.sourceUrl, undefined, '已有归属的资产不可再次登记')
  assert.equal(session.nodes[0].url, original, '准入节点的原图不被展示变换覆盖')
})

for (const status of ['failed', 'cancelled'] as const) test(`verification resolves ${status} consistently across chat and canvas`, () => {
  const session = structuredClone(source)
  session.messages[1] = { ...session.messages[1], turnOutcome: 'failed', content: '本次任务状态需要核实，请稍后刷新；不会重复生成。',
    toolTrace: [{ step: 1, toolName: 'fashion_photo.create', status: 'verification_required', reason: 'action_verification_required' }],
    plan: { id: 'p', prompt: '换白底', referenceNodeIds: ['input-node'], status: 'submitted', settings: { model: 'nano-banana-2', imageRatio: '3:4', resolution: '1k' },
      task: { taskId: 't', status, progress: 100, message: '第三方生图 API failed' }, resultAdmission: { state: 'pending', taskId: 't' } } }
  const snapshot = projectAgentChat(session, [submission], [{ ...receipt, state: 'settled' }])
  const answer = snapshot.messages[1]
  assert.ok(answer.role === 'assistant')
  assert.equal(snapshot.active, false)
  assert.equal(snapshot.items[0].status, 'failed')
  assert.equal(answer.results[0].status, 'failed')
  assert.match(answer.body ?? '', /未能交付|已取消/)
  assert.doesNotMatch(JSON.stringify(answer), /fashion_photo|action_verification_required|第三方|请稍后刷新/)
})

test('verification without a task pointer remains visible and polled instead of silently dropping the output', () => {
  const session = structuredClone(source)
  session.messages[1] = { ...session.messages[1], turnOutcome: 'failed',
    plan: { id: 'p', prompt: '换白底', referenceNodeIds: ['input-node'], status: 'proposed', settings: { model: 'nano-banana-2', imageRatio: '3:4', resolution: '1k' }, resultAdmission: { state: 'verifying' } } }
  const snapshot = projectAgentChat(session, [], [{ ...receipt, state: 'settled' }])
  assert.equal(snapshot.active, true)
  assert.equal(snapshot.items[0]?.status, 'running')
  assert.equal(snapshot.items[0]?.generationPhase, 'processing')
})


test('LOOP-02 lifecycle separates blocked, stopped, interrupted and delivery facts', () => {
  const session = structuredClone(source)
  const receipts = [{ ...receipt, state: 'settled' as const }]
  session.messages[1].turnOutcome = 'blocked'
  assert.deepEqual(projectAgentChat(session, [], receipts).lifecycle, { receipt: 'settled', turn: 'waiting_input', delivery: 'none' })
  session.messages[1].turnOutcome = 'stopped'
  session.photoSlots = [slot]
  const waiting = projectAgentChat(session, [], receipts, events)
  assert.equal(waiting.lifecycle?.turn, 'stopped')
  assert.equal(waiting.lifecycle?.delivery, 'delivery_pending')
  assert.equal(waiting.active, true)
  session.nodes.push({ id: 'late', assetId: 'late', taskId: 'batch', name: '结果', url: '/late.png', width: 768, height: 1024, x: 0, y: 0 })
  session.photoSlots = [{ ...slot, state: 'admitted', imageRef: { nodeId: 'late', assetId: 'late', taskId: 'batch' } }]
  const late = projectAgentChat(session, [], receipts, events)
  assert.equal(late.lifecycle?.turn, 'stopped')
  assert.equal(late.lifecycle?.delivery, 'delivered')
  assert.equal(late.items[0].id, waiting.items[0].id)
  assert.equal(late.items[0].image.id, 'late')
  session.messages[1].interrupted = true
  assert.equal(projectAgentChat(session, [], receipts, events).lifecycle?.turn, 'interrupted')
})

test('LOOP-04 only explicit retryable failed slots expose frozen retry targets', () => {
  const failure: Phase1PhotoSlotView = { ...slot, automaticRetryLimit: 5, automaticRetriesUsed: 5, attemptNumber: 6,
    state: 'failed', reason: { code: 'provider_failed', nextStep: '可以重试失败位', canManualReshoot: true } }
  const snapshot = projectAgentChat({ ...source, photoSlots: [failure] }, [], [{ ...receipt, state: 'settled' }], events)
  assert.equal(snapshot.items[0].retryAllowed, true)
  assert.deepEqual(snapshot.items[0].agentRetry, { kind: 'phase1', runId: 'run', taskId: 'batch', slotId: 'slot', expectedAttemptNumber: 6 })
  const stopped = projectAgentChat({ ...source, photoSlots: [{ ...failure, batchStopped: true }] }, [], [{ ...receipt, state: 'settled' }], events)
  assert.equal(stopped.items[0].retryAllowed, false)
})

test('LOOP-04 raw output metadata without a C8 node stays verifying and never publishes or retries', () => {
  const session = structuredClone(source)
  session.messages[1].plan = { id: 'image-plan', prompt: '原图', referenceNodeIds: [], settings: { model: 'nano-banana-2', imageRatio: '3:4', resolution: '1k' }, status: 'submitted', task: { taskId: 'image-task', status: 'success', progress: 100, message: '供应商成功' }, resultAdmission: { state: 'pending', taskId: 'image-task' },
    outputSlots: [{ slotId: 'image_1', slotIndex: 1, attemptNumber: 2, state: 'admitted', retryable: false, assetId: 'unverified-asset' }] }
  const snapshot = projectAgentChat(session, [], [{ ...receipt, state: 'settled' }])
  assert.equal(snapshot.items[0].status, 'running')
  assert.equal(snapshot.items[0].generationPhase, 'processing')
  assert.equal(snapshot.items[0].image.id, 'agent-placeholder')
  assert.ok(!snapshot.items[0].retryAllowed)
  assert.equal(snapshot.lifecycle?.delivery, 'verifying')
})

test('LOOP-04 retry message follows admitted outcome but never claims a later attempt as its own success', () => {
  const session = structuredClone(source)
  session.nodes.push({ id: 'result', assetId: 'result', taskId: 'image-task', name: '结果', url: '/result.png', width: 768, height: 1024, x: 0, y: 0 })
  session.messages[1].plan = { id: 'image-plan', prompt: '原图', referenceNodeIds: [], settings: { model: 'nano-banana-2', imageRatio: '3:4', resolution: '1k' }, status: 'submitted', task: { taskId: 'image-task', status: 'success', progress: 100, message: '已生成' }, resultAdmission: { state: 'admitted', taskId: 'image-task', resultCount: 1 },
    outputSlots: [{ slotId: 'image_1', slotIndex: 1, attemptNumber: 2, state: 'admitted', retryable: false, assetId: 'result' }] }
  session.messages.push({ id: 'retry-run', role: 'assistant', content: '正在重试', referenceNodeIds: [], createdAt: date,
    retryOf: { kind: 'image', runId: 'run', taskId: 'image-task', slotId: 'image_1', expectedAttemptNumber: 1 } })
  let reply = projectAgentChat(session, [], [{ ...receipt, state: 'settled' }]).messages.find(message => message.id === 'retry-run')
  assert.ok(reply?.role === 'assistant')
  assert.match(reply.body ?? '', /已通过重试交付（第 2 次尝试）/)
  session.messages[1].plan.outputSlots![0].attemptNumber = 3
  reply = projectAgentChat(session, [], [{ ...receipt, state: 'settled' }]).messages.find(message => message.id === 'retry-run')
  assert.ok(reply?.role === 'assistant')
  assert.match(reply.body ?? '', /本次重试为第 2 次尝试.*后续尝试/)
  assert.doesNotMatch(reply.body ?? '', /已通过重试交付/)
  assert.match(reply.steps[0].label, /第 2 次尝试/)
})
