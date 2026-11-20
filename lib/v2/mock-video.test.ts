import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource } from './mock'
import { normalizeVideoGeneration } from './video-options'
import type { AgentEvent, SendInput } from './data-source'
import type { AssistantMessage, CanvasItem } from './types'

const wait = () => new Promise(resolve => setTimeout(resolve, 5))

/** mock 视频流程：离线自测也走完整的「生成中 → 封面 + 可播放视频」投影。 */
async function sendVideo(overrides: Partial<SendInput> = {}) {
  const ds = createMockDataSource({ pause: async () => {} })
  const events: AgentEvent[] = []
  const input: SendInput = {
    text: '黄昏草原里模特转身，裙摆飘起',
    attachments: [],
    mode: 'video',
    generation: { ...normalizeVideoGeneration(), modelId: 'grok-imagine-video', ratio: '16:9', resolution: '720p', count: 1, duration: 6 },
    ...overrides,
  }
  await ds.sendMessage('pj_new', input, event => events.push(structuredClone(event)))
  for (let i = 0; i < 40; i++) await wait()
  const project = await ds.getProject('pj_new')
  return { events, project }
}

test('mock 视频消息产出画布视频节点与可播放结果卡', async () => {
  const { events, project } = await sendVideo()
  assert.ok(project, '项目可读取')
  const items = (project?.items ?? []).filter(item => item.mediaType === 'video')
  assert.equal(items.length, 1)
  const item = items[0] as CanvasItem & { video?: { url: string; duration: number } }
  assert.equal(item.status, 'done')
  assert.equal(item.video?.duration, 6)
  assert.match(item.video?.url ?? '', /\/v2-mock\/video-demo\.mp4$/)
  assert.ok(item.image.url.length > 0, '完成态有封面')

  const assistant = (project?.messages ?? []).filter(message => message.role === 'assistant').at(-1)
  assert.ok(assistant && assistant.role === 'assistant')
  const message = assistant as AssistantMessage
  assert.equal(message.results.length, 1)
  assert.equal(message.results[0]?.status, 'done')
  assert.equal(message.results[0]?.video?.duration, 6)
  assert.match(message.meta?.spec ?? '', /6s · 1280×720 · 16:9 · Grok Imagine Video/)
  assert.ok(events.some(event => event.type === 'item-add' && event.item.mediaType === 'video'))
  assert.ok(events.some(event => event.type === 'done'))
})

test('mock 视频带首帧：画幅跟随原图并记录占位', async () => {
  const frame = {
    kind: 'upload' as const, id: 'frame-1', label: '首帧.png',
    image: { id: 'frame-1', url: '/v2-mock/c1.jpg', width: 800, height: 1200 },
  }
  const { project } = await sendVideo({ attachments: [frame] })
  const item = (project?.items ?? []).find(item => item.mediaType === 'video')
  assert.ok(item)
  assert.deepEqual(item.targetSize, { width: 720, height: 1080 }, '竖版首帧 → 竖版输出')
  assert.equal(item.placeholder?.id, 'frame-1')
  const assistant = (project?.messages ?? []).filter(message => message.role === 'assistant').at(-1)
  assert.ok(assistant?.role === 'assistant')
  assert.match((assistant as AssistantMessage).meta?.spec ?? '', /跟随原图/)
})
