import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource, TOOLS } from './mock'
import { filterGenerations, generationToolParameters, groupGenerationDays, replayParameters } from './generation-history'
import { zipImages } from './generation-download'

test('mock provides three calendar groups, pagination, favorite/removal and complete sibling set', async () => {
  const ds = createMockDataSource()
  const all = await ds.listGenerations()
  assert.equal(groupGenerationDays(all).length, 3)
  assert.ok(groupGenerationDays(all).every(group => group.records.length > 1))
  const page = await ds.listGenerationPage({ limit: 2, sort: 'oldest' })
  assert.equal(page.generations.length, 2); assert.equal(page.total, all.length)
  const g = all.find(record => record.id === 'g_m1')
  assert.ok(g)
  assert.equal((await ds.getGeneration(g.id))!.siblings.length, 4)
  await ds.setGenerationFavorite([g.id], true)
  assert.equal((await ds.listGenerationPage({ favorite: true })).total, 1)
  await ds.deleteGenerations([g.id])
  assert.equal(await ds.getGeneration(g.id), null)
  assert.ok((await ds.getProject(g.projectId))!.items.some(item => item.ref.id === g.id))
})

test('date grouping uses calendar days across a month boundary; replay excludes masks and URLs', () => {
  const base = { id: 'one', projectId: 'p', image: { id: 'i', url: '', width: 1, height: 1 }, productIds: [], kind: 'main' as const, status: 'done' as const }
  assert.deepEqual(groupGenerationDays([{ ...base, createdAt: new Date(2026, 10, 30, 23).toISOString() }], new Date(2026, 11, 1, 0, 1)).map(g => g.label), ['昨天'])
  assert.deepEqual(replayParameters({ prompt: '商品', n: '2', angles: ['front'], maskDataUrl: 'secret', ref: { url: 'secret' }, apiKey: 'secret' }), { prompt: '商品', n: '2', angles: ['front'] })
})

test('tool filters include option variants while an explicit option stays exact', async () => {
  const ds = createMockDataSource()
  const [base] = await ds.listGenerations()
  const records = [
    { ...base, id: 'one', toolId: 'upscale:2x' },
    { ...base, id: 'two', toolId: 'upscale:4x' },
    { ...base, id: 'three', toolId: 'white-bg' },
  ]
  assert.equal(filterGenerations(records, { toolId: 'upscale' }).total, 2)
  assert.deepEqual(filterGenerations(records, { toolId: 'upscale:2x' }).generations.map(g => g.id), ['one'])
  assert.equal(filterGenerations(records, { toolId: 'white-bg' }).total, 1)
})

test('history drafts use current tool fields, retain recorded choices, and require fresh masks/references', () => {
  const upscale = TOOLS.find(tool => tool.id === 'upscale')!
  assert.deepEqual(generationToolParameters(upscale, { prompt: '旧提示', ratio: '1:1', historyOption: '4x' }), {})
  const inpaint = TOOLS.find(tool => tool.id === 'inpaint')!
  const draft = generationToolParameters(inpaint, {
    prompt: '修改领口', n: '2', ratio: '1:1', maskDataUrl: 'data:image/png;base64,old',
    ref: { id: 'old', url: '/old.png', width: 100, height: 100 },
  })
  assert.equal(draft.prompt, '修改领口')
  assert.equal(draft.n, '2')
  assert.equal(draft.ref, undefined)
  assert.equal(draft.maskDataUrl, undefined)
  assert.equal(draft.ratio, undefined)
  assert.ok(Object.keys(draft).every(key => inpaint.fields?.some(field => field.id === key)))
})

test('ZIP download contains UTF-8 names, correct CRC and central directory offsets', async () => {
  const zip = new Uint8Array(await zipImages([{ name: '图片.jpg', bytes: new TextEncoder().encode('123456789') }]).arrayBuffer())
  const view = new DataView(zip.buffer)
  assert.equal(view.getUint32(0, true), 0x04034b50)
  assert.equal(view.getUint32(14, true), 0xcbf43926)
  const directoryOffset = view.getUint32(zip.length - 6, true)
  assert.equal(view.getUint32(directoryOffset, true), 0x02014b50)
  assert.equal(view.getUint32(directoryOffset + 42, true), 0)
  assert.equal(new TextDecoder().decode(zip.slice(30, 30 + view.getUint16(26, true))), '图片.jpg')
})
