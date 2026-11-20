import assert from 'node:assert/strict'
import test from 'node:test'
import { chatMessagesSchema } from './project-schema'
import { regeneratePlan, regenerationNotice, regenerationRecord } from './regenerate'
import type { CanvasItem, ChatMessage } from './types'

const source: CanvasItem = { id: 'source', ref: { type: 'material', id: 'material' }, image: { id: 'image', url: '/v2-mock/c1.jpg', width: 640, height: 857 }, x: 40, y: 60, w: 150 }
const result: CanvasItem = { ...source, id: 'result', ref: { type: 'generation', id: 'generation' }, image: { ...source.image, id: 'result-image' }, parentIds: [source.id], x: 400, status: 'done' }

test('tool replay retains tool option, every source and G2 safe parameters', () => {
  const reference = { ...source, id: 'reference' }
  const plan = regeneratePlan({ ...result, parentIds: [source.id, reference.id] }, [source, reference, result], {
    toolId: 'upscale:4x', params: { prompt: '过时' },
    replayParams: { prompt: '保留商品版型', n: '2', angles: ['front'], maskDataUrl: 'data:image/png;base64,old', ref: reference.image, historyOption: '2x' },
  })
  assert.deepEqual(plan, { kind: 'tool', toolId: 'upscale:4x', sourceIds: [source.id, reference.id], params: { prompt: '保留商品版型', n: '2', angles: ['front'] } })
})

test('chat replay restores prompt and current source references without attaching its own output', () => {
  const plan = regeneratePlan(result, [source, result], { source: 'agent', prompt: '自然光主图' })
  assert.deepEqual(plan, { kind: 'chat', text: '自然光主图', attachments: [{ kind: 'canvas', id: source.id, label: '图 1', image: source.image }] })
  assert.deepEqual(regeneratePlan({ ...result, parentIds: [] }, [result], { source: 'agent', prompt: '纯文字生图' }), { kind: 'chat', text: '纯文字生图', attachments: [] })
})

test('missing primary or secondary source disables both actions with a clear reason', () => {
  const generation = { toolId: 'swap-bg', params: { scene: 'nature' } }
  assert.deepEqual(regeneratePlan(result, [result], generation), { kind: 'unavailable', reason: '来源图片已删除' })
  assert.deepEqual(regeneratePlan({ ...result, parentIds: [source.id, 'deleted'] }, [source, result], generation), { kind: 'unavailable', reason: '来源图片已删除' })
  assert.deepEqual(regeneratePlan(result, [result], { source: 'agent', prompt: '主图' }), { kind: 'unavailable', reason: '来源图片已删除' })
})

test('old tool records without parameters remain available and explicitly use defaults', () => {
  const old = { ...result, parentIds: undefined, parentId: source.id }
  const plan = regeneratePlan(old, [source, old], { toolId: 'swap-bg' })
  assert.deepEqual(plan, { kind: 'tool', toolId: 'swap-bg', sourceIds: [source.id], params: {} })
  assert.equal(regenerationNotice(plan), '未记录参数，将使用默认参数')
  assert.equal(regenerationNotice(regeneratePlan(old, [source, old], { toolId: 'swap-bg', params: { scene: 'nature' } })), undefined)
})

test('legacy history IDs resolve to canvas nodes while explicit empty ancestry stays empty', () => {
  const old = { ...result, parentIds: undefined }
  assert.deepEqual(regeneratePlan(old, [source, old], { toolId: 'white-bg', parentId: source.image.id }), { kind: 'tool', toolId: 'white-bg', sourceIds: [source.id], params: {} })
  assert.deepEqual(regeneratePlan({ ...old, parentIds: [] }, [source, old], { toolId: 'white-bg', parentId: source.id }), { kind: 'unavailable', reason: '未记录来源图片' })
})

test('user turn lookup uses result identity, retains mentions/library roles, and excludes transient references', () => {
  const messages: ChatMessage[] = [
    { id: 'u', role: 'user', text: '请保留 @领口 的细节', attachments: [
      { kind: 'canvas', id: source.id, label: '领口', image: { ...source.image, url: '/old.png' } },
      { kind: 'brand', id: 'brand', label: '品牌', image: { ...source.image, id: 'brand-image' } },
      { kind: 'upload', id: 'temporary', label: '临时', image: { ...source.image, url: 'blob:old' } },
    ], createdAt: '' },
    { id: 'a', role: 'assistant', steps: [], results: [{ id: result.ref.id, status: 'done' }], createdAt: '' },
    { id: 'later', role: 'user', text: '下一轮', attachments: [], createdAt: '' },
  ]
  const record = regenerationRecord(result, messages, { source: 'agent', prompt: '供应商扩写的文字' })
  const plan = regeneratePlan(result, [source, result], record)
  assert.equal(plan.kind, 'chat')
  if (plan.kind !== 'chat') throw new Error('expected chat plan')
  assert.equal(plan.text, '请保留 @领口 的细节')
  assert.deepEqual(plan.attachments.map(attachment => attachment.kind), ['canvas', 'brand'])
  assert.equal(plan.attachments[0].image.url, source.image.url)
  assert.equal(regenerationRecord(result, messages, { toolId: 'swap-bg' })?.toolId, 'swap-bg')
  assert.equal(regeneratePlan(result, [result], record).kind, 'unavailable')
})

test('unidentified, non-result and unfinished nodes cannot silently create a fresh request', () => {
  assert.equal(regeneratePlan(source, [source], { toolId: 'swap-bg' }).kind, 'unavailable')
  assert.equal(regeneratePlan({ ...result, status: 'running' }, [source, result], { toolId: 'swap-bg' }).kind, 'unavailable')
  assert.deepEqual(regeneratePlan(result, [source, result]), { kind: 'unavailable', reason: '未记录生成方式' })
})

test('segmented reply preamble between the user turn and its results still restores the user prompt', () => {
  const messages: ChatMessage[] = [
    { id: 'u', role: 'user', text: '户外自然光主图', attachments: [{ kind: 'canvas', id: source.id, label: '图 1', image: source.image }], createdAt: '' },
    { id: 'think', role: 'assistant', steps: [{ label: '画布读取完成', icon: 'doc', status: 'done' }, { label: '思考完成', icon: 'think', status: 'done' }], results: [], createdAt: '' },
    { id: 'a', role: 'assistant', steps: [{ itemId: result.id, label: 'AI 商品主图 · 第 1 张', icon: 'image' }], results: [{ id: result.ref.id, itemId: result.id, status: 'done' }], createdAt: '' },
  ]
  const record = regenerationRecord(result, messages)
  assert.equal(record?.source, 'agent')
  assert.equal(record?.prompt, '户外自然光主图')
  assert.deepEqual(regeneratePlan(result, [source, result], record), { kind: 'chat', text: '户外自然光主图', attachments: [{ kind: 'canvas', id: source.id, label: '图 1', image: source.image }] })
  // 前导消息里若已有逐张结果步骤，则不是同轮前导，不能越过它借用更早的提示词
  const toolLike: ChatMessage[] = [messages[0], { ...messages[1], steps: [{ itemId: 'other', label: 'AI扩图 · 第 1 张', icon: 'image' }] } as ChatMessage, messages[2]]
  assert.equal(regenerationRecord(result, toolLike), undefined)
})

test('a missing standalone tool record cannot borrow an unrelated previous chat prompt', () => {
  const messages: ChatMessage[] = [
    { id: 'u', role: 'user', text: '早先的提示词', attachments: [], createdAt: '' },
    { id: 'chat', role: 'assistant', steps: [], results: [], createdAt: '' },
    { id: 'tool', role: 'assistant', steps: [], results: [{ id: result.ref.id, status: 'done' }], createdAt: '' },
  ]
  assert.equal(regenerationRecord(result, messages), undefined)
  assert.equal(regenerationRecord(result, [{ ...messages[0], role: 'user', text: '/换背景', attachments: [] }, messages[2]]), undefined)
})

test('chat regeneration restores uploaded product, model and other references even when the turn omits a parent', () => {
  const product = { ...source, id: 'product', image: { ...source.image, id: 'product-image' } }
  const model = { ...source, id: 'model', image: { ...source.image, id: 'model-image' }, assetKind: 'model' as const }
  const output = { ...result, parentIds: [product.id, model.id] }
  const plan = regeneratePlan(output, [product, model, output], {
    source: 'agent', prompt: '商品穿在模特身上',
    attachments: [
      { kind: 'model', id: 'library-model', label: '模特', image: model.image },
      { kind: 'brand', id: 'brand', label: '其他参考', image: { ...source.image, id: 'brand-image' } },
    ],
  })
  assert.equal(plan.kind, 'chat')
  if (plan.kind !== 'chat') throw new Error('expected chat plan')
  assert.deepEqual(new Set(plan.attachments.map(a => a.image.id)), new Set(['product-image', 'model-image', 'brand-image']))
  assert.equal(plan.attachments.filter(a => a.image.id === 'model-image').length, 1)
})
test('upload attachments recover their persistent canvas image before transient URL filtering', () => {
  const plan = regeneratePlan(result, [source, result], {
    source: 'agent', prompt: '保留上传商品',
    attachments: [{ kind: 'upload', id: 'old-upload', label: '商品原图', image: { ...source.image, url: 'blob:expired' } }],
  })
  assert.equal(plan.kind, 'chat')
  if (plan.kind !== 'chat') throw new Error('expected chat plan')
  assert.equal(plan.attachments.length, 1)
  assert.equal(plan.attachments[0].label, '商品原图')
  assert.equal(plan.attachments[0].image.url, source.image.url)
})

for (const kind of ['upload', 'canvas'] as const) {
  test(`mock blob product (${kind}) and library model both restore current images`, () => {
    const product = { ...source, image: { ...source.image, url: 'blob:current-product' } }
    const model = { kind: 'model' as const, id: 'library-model', label: '林夕（占位）', image: { ...source.image, id: 'model-image' } }
    const plan = regeneratePlan(result, [product, result], {
      source: 'agent', prompt: '模特穿着商品', attachments: [
        { kind, id: kind === 'canvas' ? product.id : 'upload', label: '上传 k-701-look01.jpg', image: { ...product.image, url: 'blob:expired' } }, model,
      ],
    })
    assert.equal(plan.kind, 'chat')
    if (plan.kind !== 'chat') throw new Error('expected chat plan')
    assert.deepEqual(plan.attachments.map(a => a.image), [product.image, model.image])
    assert.equal(regenerationNotice(plan), undefined)
  })
}

for (const url of ['blob:orphan', 'data:image/png;base64,old']) {
  test(`orphan transient reference ${url} is skipped with an explicit notice`, () => {
    const plan = regeneratePlan({ ...result, parentIds: [] }, [result], {
      source: 'agent', prompt: '重拍', attachments: [
        { kind: 'upload', id: 'orphan', label: '商品', image: { ...source.image, url } },
        { kind: 'model', id: 'model', label: '模特', image: { ...source.image, id: 'model-image' } },
      ],
    })
    assert.equal(plan.kind, 'chat')
    if (plan.kind !== 'chat') throw new Error('expected chat plan')
    assert.deepEqual(plan.attachments.map(a => a.id), ['model'])
    assert.equal(regenerationNotice(plan), '部分引用已失效，请重新添加后再生成')
  })
}

for (const mode of ['agent', 'image'] as const) test(`重生成和带回输入框均保留 ${mode} 模式与原张数`, () => {
  const generation = { modelId: 'nano-banana-2.1', ratio: '3:4', resolution: '2k', count: mode === 'image' ? 2 : 5 }
  const messages: ChatMessage[] = [
    { id: 'u', role: 'user', text: '主图', attachments: [], mode, generation, createdAt: '2026-11-17T00:00:00.000Z' },
    { id: 'a', role: 'assistant', results: [{ id: result.ref.id, status: 'done' }], steps: [], createdAt: '2026-11-17T00:00:00.000Z' },
  ]
  assert.deepEqual(chatMessagesSchema.parse(messages), messages)
  if (mode === 'image') assert.deepEqual(chatMessagesSchema.parse(messages.map(message => message.role === 'user' ? { ...message, mode: 'direct' } : message)), messages)
  for (const record of [regenerationRecord(result, chatMessagesSchema.parse(messages)), { source: 'agent' as const, prompt: '主图', mode, generation }]) {
    const plan = regeneratePlan(result, [source, result], record)
    assert.ok(plan.kind === 'chat')
    assert.equal(plan.mode, mode)
    assert.deepEqual(plan.generation, generation)
  }
})
