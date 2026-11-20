import assert from 'node:assert/strict'
import test from 'node:test'
import { createExportDownload, EXPORT_MIME, type ExportFormat, type ExportIO, type ExportOptions } from './export-archive'

const options: ExportOptions = {
  projectName: '春装', size: '1k', format: 'png',
}
const image = { id: 'image', url: '/mock.png', width: 1600, height: 800 }
// 不创建 DOM 或 canvas；替代公开 I/O 边界，渲染层按任务卡不写单测。
const source: CanvasImageSource = { width: 1600, height: 800 } as HTMLImageElement
const load: ExportIO['load'] = async () => ({ source, width: 1600, height: 800, dispose() {} })

function entries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer)
  const result: { name: string; data: string }[] = []
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const dataOffset = offset + 30 + nameLength
    result.push({ name: new TextDecoder().decode(bytes.slice(offset + 30, dataOffset)), data: new TextDecoder().decode(bytes.slice(dataOffset, dataOffset + size)) })
    offset = dataOffset + size
  }
  return result
}

test('单张 PNG/JPG 直接交付图片与自动文件名，不经过 ZIP', async () => {
  for (const format of ['png', 'jpg'] satisfies ExportFormat[]) {
    const io: ExportIO = { load, encode: async (_, rect, opts) => {
      assert.deepEqual(rect, { canvasW: 1024, canvasH: 512 })
      return new Blob(['encoded'], { type: EXPORT_MIME[opts.format] })
    } }
    const progress: number[] = []
    const download = await createExportDownload([image], { ...options, format }, new AbortController().signal, done => progress.push(done), io)
    assert.equal(download.blob.type, EXPORT_MIME[format])
    assert.equal(await download.blob.text(), 'encoded')
    assert.equal(download.name, `春装_001.${format}`)
    assert.deepEqual(progress, [1])
  }
})

test('串行处理完整范围、固定参数快照，按进度交付一个完整 ZIP', async () => {
  let active = 0
  let disposed = 0
  const events: string[] = []
  const config = { ...options, projectName: '主图/白色' }
  const io: ExportIO = {
    load: async () => { active++; assert.equal(active, 1); return { source, width: 1000, height: 500, dispose() { active--; disposed++ } } },
    encode: async (_, __, opts) => { assert.equal(opts.projectName, '主图/白色'); assert.equal(opts.size, '1k'); return new Blob(['pixels'], { type: 'image/png' }) },
  }
  const download = await createExportDownload([image, { ...image, id: 'two' }], config, new AbortController().signal, (done, total) => {
    events.push(`${done}/${total}`)
    config.projectName = 'changed'
    config.size = 'original'
  }, io)
  assert.deepEqual(events, ['1/2', '2/2'])
  assert.equal(disposed, 2)
  assert.equal(download.name, '主图_白色_导出.zip')
  assert.equal(download.blob.type, 'application/zip')
  assert.deepEqual(entries(new Uint8Array(await download.blob.arrayBuffer())).map(file => file.name), ['主图_白色_001.png', '主图_白色_002.png'])
})

test('元数据过期时按解码尺寸输出，不放大小图并释放图片', async () => {
  let disposed = false
  const io: ExportIO = {
    load: async () => ({ source, width: 100, height: 50, dispose() { disposed = true } }),
    encode: async (_, rect) => {
      assert.deepEqual(rect, { canvasW: 100, canvasH: 50 })
      return new Blob(['ok'], { type: 'image/png' })
    },
  }
  await createExportDownload([image], options, new AbortController().signal, undefined, io)
  assert.equal(disposed, true)
})

test('不把浏览器编码降级的 PNG 错标成 JPG', async () => {
  await assert.rejects(createExportDownload([image], { ...options, format: 'jpg' }, new AbortController().signal, undefined, {
    load, encode: async () => new Blob(['png'], { type: 'image/png' }),
  }), /不支持 JPG/)
})

test('任意图片加载失败或用户取消，不返回部分打包结果', async () => {
  let loads = 0
  const io: ExportIO = {
    load: async (...args) => { if (++loads === 2) throw new Error('图片加载失败'); return load(...args) },
    encode: async () => new Blob(['ok'], { type: 'image/png' }),
  }
  await assert.rejects(createExportDownload([image, image], options, new AbortController().signal, undefined, io), /图片加载失败/)
  const controller = new AbortController()
  let disposed = false
  await assert.rejects(createExportDownload([image, image], options, controller.signal, undefined, {
    load: async () => ({ source, width: 1600, height: 800, dispose() { disposed = true } }),
    encode: async () => { controller.abort(); return new Blob(['ok'], { type: 'image/png' }) },
  }), { name: 'AbortError' })
  assert.equal(disposed, true)
})

test('空范围、超 100 张在加载图片前拒绝', async () => {
  const io: ExportIO = { load: async () => { assert.fail('非法输入不应加载') }, encode: async () => { assert.fail('不应编码') } }
  for (const images of [[], Array.from({ length: 101 }, () => image)]) {
    await assert.rejects(createExportDownload(images, options, new AbortController().signal, undefined, io), /1–100/)
  }
})
