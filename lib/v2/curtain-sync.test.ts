import assert from 'node:assert/strict'
import test from 'node:test'
import type { CurtainPatch } from './project-schema'
import type { CanvasItem } from './types'
import { applyCanvasAgentEvent, createCurtainSync } from './curtain-sync'

const card = (id: string, extra: Partial<CanvasItem> = {}): CanvasItem => ({
  id,
  ref: { type: 'material', id: `asset-${id}` },
  image: { id: `asset-${id}`, url: `/${id}.png`, width: 1000, height: 1000 },
  x: 0,
  y: 0,
  w: 150,
  ...extra,
})

test('拖动后立即离开项目，关闭同步队列前保存待提交的位置', async () => {
  const patches: CurtainPatch[] = []
  const sync = createCurtainSync({
    debounceMs: 60_000,
    async send(patch) { patches.push(patch) },
  })
  const original = card('move')
  const moved = { ...original, x: 80, y: 40 }
  sync.reset([original])
  sync.sync([moved])
  const saving = sync.flush()
  sync.dispose()
  await saving
  assert.deepEqual(patches, [{ upsert: [moved] }])
})

test('生成结果首次回存前被删除时，仍提交删除 ID 且只提交一次', async () => {
  const patches: CurtainPatch[] = []
  const sync = createCurtainSync({
    debounceMs: 60_000,
    async send(patch) { patches.push(patch) },
  })
  const result = card('result', { ref: { type: 'generation', id: 'output' }, status: 'done' })
  sync.reset([])
  sync.sync([result])
  sync.sync([])
  assert.equal(sync.isRemoved(result.id), true)
  await sync.flush()
  await sync.flush()
  assert.deepEqual(patches, [{ removeIds: [result.id] }])
  sync.dispose()
})

test('reset 零请求；多次拖动、新增、删除合并为最小增量补丁；无变更 flush 不发请求', async () => {
  const patches: CurtainPatch[] = []
  const sync = createCurtainSync({
    debounceMs: 20,
    async send(patch) { patches.push(structuredClone(patch)) },
  })

  const a = card('a', { x: 10, y: 20 })
  const b = card('b', { x: 200, y: 20 })
  sync.reset([a, b])
  await sync.flush()
  assert.deepEqual(patches, [], '初始加载还原不应触发回写')

  // 连续拖动 a、删除 b、新增 c，在一次刷盘中合并为最小增量
  const c = card('c', { x: 400, y: 20, parentIds: ['a'] })
  sync.sync([{ ...a, x: 30 }, b])
  sync.sync([{ ...a, x: 80 }, c])
  assert.equal(sync.isRemoved('b'), true)
  await sync.flush()

  assert.equal(patches.length, 1)
  assert.deepEqual(patches[0], {
    upsert: [{ ...a, x: 80 }, c],
    removeIds: ['b'],
  })

  // 已同步状态下再次 flush 零请求
  await sync.flush()
  assert.equal(patches.length, 1)

  // 图层顺序变化仅发 orderIds，不重复传未改动的完整节点
  sync.sync([c, { ...a, x: 80 }])
  await sync.flush()
  assert.equal(patches.length, 2)
  assert.deepEqual(patches[1], { orderIds: ['c', 'a'] })
  sync.dispose()
})

test('running 占位首次落位与拖动会持久化，瞬态进度跳动不触发写库，终态成片原地替换并回存', async () => {
  const patches: CurtainPatch[] = []
  const sync = createCurtainSync({
    debounceMs: 10,
    async send(patch) { patches.push(structuredClone(patch)) },
  })

  const source = card('src', { x: 40, y: 60, w: 150 })
  const obstacle = card('obs', { x: 238, y: 60, w: 150 })
  let items = [source, obstacle]
  sync.reset(items)

  // 服务端推来默认坐标 (0,0) 的 running 占位：前端按实时画布避开 source 与 obstacle 落位在右侧
  const incomingPlaceholder = card('out-1', {
    ref: { type: 'generation', id: 'out-1' },
    status: 'running',
    generationPhase: 'queued',
    progress: 0,
    parentIds: ['src'],
    x: 0,
    y: 0,
  })
  const first = applyCanvasAgentEvent(items, { type: 'item-add', item: incomingPlaceholder })
  assert.equal(first.addedNew, true)
  items = first.items
  const placed = items.find(i => i.id === 'out-1')!
  assert.ok(placed.x >= obstacle.x + obstacle.w + 14, `新占位应避开实时障碍物，实际 x=${placed.x}`)
  assert.equal(placed.y, source.y)

  sync.sync(items)
  await sync.flush()
  assert.equal(patches.length, 1, '首次占位落位必须持久化坐标')
  assert.equal(patches[0].upsert?.[0]?.id, 'out-1')

  // 运行中仅 progress / generationPhase 跳动：不应产生网络写请求
  for (const progress of [18, 46, 82]) {
    items = applyCanvasAgentEvent(items, {
      type: 'item-update',
      id: 'out-1',
      patch: { progress, generationPhase: 'generating' },
    }).items
    sync.sync(items)
  }
  await sync.flush()
  assert.equal(patches.length, 1, '瞬态进度更新不写库')

  // 生成期间用户手动拖动了占位框：新坐标必须持久化，且后续成片到达时保留用户拖动后的坐标
  items = items.map(i => i.id === 'out-1' ? { ...i, x: 720, y: 300 } : i)
  sync.sync(items)
  await sync.flush()
  assert.equal(patches.length, 2)
  assert.equal(patches[1].upsert?.[0]?.x, 720)

  // 成片推来（即使再次经过 item-add 回放或 item-update）：原地替换，保留 (720, 300) 并回存终态
  items = applyCanvasAgentEvent(items, {
    type: 'item-update',
    id: 'out-1',
    patch: {
      status: 'done',
      progress: 100,
      ref: { type: 'generation', id: 'asset-final' },
      image: { id: 'asset-final', url: '/final.png', width: 1024, height: 1024 },
    },
  }).items
  sync.sync(items)
  await sync.flush()
  assert.equal(patches.length, 3)
  assert.equal(patches[2].upsert?.[0]?.status, 'done')
  assert.equal(patches[2].upsert?.[0]?.x, 720)
  assert.equal(patches[2].upsert?.[0]?.image.url, '/final.png')

  // 用户在画布上删掉 out-1 后，在途轮询迟到推来的 item-add / item-update 不得让它复活
  items = items.filter(i => i.id !== 'out-1')
  sync.sync(items)
  const staleAdd = applyCanvasAgentEvent(items, { type: 'item-add', item: { ...placed, status: 'done' } }, { isRemoved: id => sync.isRemoved(id) })
  assert.equal(staleAdd.addedNew, false)
  assert.equal(staleAdd.items.some(i => i.id === 'out-1'), false)
  await sync.flush()
  assert.deepEqual(patches[3], { removeIds: ['out-1'] })
  sync.dispose()
})
