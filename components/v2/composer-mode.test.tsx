import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import { composerModeKey } from '@/lib/v2/agent-mode'
import { createMockDataSource } from '@/lib/v2/mock'
import type { ChatAttachment } from '@/lib/v2/types'

const browser = new Window({ url: 'http://localhost/v2' })
for (const key of ['self', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLDialogElement', 'Node', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'CustomEvent', 'NodeFilter', 'HTMLSelectElement', 'KeyboardEvent', 'Event', 'InputEvent']) {
  const value = Reflect.get(browser, key)
  Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && /^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame)$/.test(key) ? value.bind(browser) : value })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
let Composer: typeof import('./composer').Composer
let composerAttachments: typeof import('@/lib/v2/composer-input').composerAttachments

async function mount(child: React.ReactNode) {
  const { createRoot } = await import('react-dom/client')
  const { V2Provider } = await import('@/lib/v2/data-source')
  const { V2AuthProvider } = await import('./auth')
  const { ToastProvider } = await import('./ui')
  const source = { ...createMockDataSource({ pause: async () => {} }), getSession: async () => ({ id: 'test-user', username: 'test-user', displayName: '测试账号' }) }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(<V2Provider source={source}><ToastProvider><V2AuthProvider>{child}</V2AuthProvider></ToastProvider></V2Provider>) })
  await settle()
  return { host, close: async () => { await act(async () => root.unmount()); host.remove() } }
}

const optionStartsWith = (host: HTMLElement, prefix: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button[data-cp-option]')].find(element => element.textContent?.trim().startsWith(prefix))
  assert.ok(found, `option starting with "${prefix}" is present`)
  return found
}

const typeText = async (host: HTMLElement, value: string) => {
  const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('首页首次默认 Agent，切换模式后按账号记住上次选择', async () => {
  ;({ Composer } = await import('./composer'))
  localStorage.clear(); sessionStorage.clear()
  let page = await mount(<Composer hero attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
  try {
    const modes = () => Array.from(page.host.querySelectorAll<HTMLButtonElement>('[aria-label="创作模式"] button'))
    const selectedMode = () => modes().find(button => button.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label')
    assert.deepEqual(modes().map(button => button.getAttribute('aria-label')), ['Agent', '图像', '视频'])
    assert.equal(selectedMode(), 'Agent')
    await act(async () => modes().find(button => button.getAttribute('aria-label') === '图像')!.click())
    await settle()
    assert.equal(selectedMode(), '图像')
    await page.close()
    page = await mount(<Composer hero attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
    assert.equal(selectedMode(), '图像', '回到首页记住上次选的模式')
  } finally { await page.close(); localStorage.clear(); sessionStorage.clear() }
})

test('三模式平铺参数、跨模式保留文字与图片、视频首帧与文生规则及项目模式隔离', async () => {
  ;({ Composer } = await import('./composer'))
  ;({ composerAttachments } = await import('@/lib/v2/composer-input'))
  localStorage.clear(); sessionStorage.clear()
  const att1: ChatAttachment = { kind: 'upload', id: 'u1', label: '主推裙.png', image: { id: 'img1', url: '/a.png', width: 800, height: 1200 } }
  const att2: ChatAttachment = { kind: 'upload', id: 'u2', label: '细节图.png', image: { id: 'img2', url: '/b.png', width: 800, height: 1200 } }
  const calls: Array<{ text: string; mode: string; attachments: ChatAttachment[]; generation: Record<string, unknown> }> = []

  function Harness({ projectId, initial = [] }: { projectId: string; initial?: ChatAttachment[] }) {
    const [atts, setAtts] = useState<ChatAttachment[]>(initial)
    return (
      <Composer
        projectId={projectId}
        attachments={atts}
        onAttachmentsChange={setAtts}
        onSend={(text, mode, submission) => {
          calls.push({
            text,
            mode,
            attachments: composerAttachments(mode, atts, submission.firstFrame),
            generation: { ...submission.generation },
          })
        }}
      />
    )
  }

  let page = await mount(<Harness projectId="proj-1" initial={[att1, att2]} />)
  try {
    const modeBtn = () => page.host.querySelector<HTMLButtonElement>('[aria-label="模式"]')!
    // 1. Agent 模式：显示比例（默认自动）与张数（默认自动）
    assert.equal(modeBtn().textContent, 'Agent')
    const agentRatio = page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!
    const agentCount = page.host.querySelector<HTMLButtonElement>('[aria-label="张数"]')!
    assert.ok(agentRatio.textContent?.includes('自动'))
    assert.ok(agentCount.textContent?.includes('自动'))

    await typeText(page.host, '春季碎花连衣裙外景')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.click()); await settle()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].mode, 'agent')
    assert.equal(calls[0].generation.ratioAuto, true)
    assert.equal(calls[0].generation.countAuto, true)

    // 手动选比例与张数后以用户为准
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="9:16"]')!.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="张数"]')!.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="2 张"]')!.click()); await settle()
    await typeText(page.host, '再来一组海报')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.click()); await settle()
    assert.equal(calls.length, 2)
    assert.equal(calls[1].generation.ratio, '9:16')
    assert.equal(calls[1].generation.count, 2)
    assert.equal(calls[1].generation.ratioAuto, false)
    assert.equal(calls[1].generation.countAuto, false)

    // 2. 切到图像模式：不清空文字和已传的两张图，四个参数全部平铺不折叠
    await typeText(page.host, '保留这段提示词切模式')
    await act(async () => modeBtn().click()); await settle()
    await act(async () => optionStartsWith(page.host, '图像').click()); await settle()
    assert.equal(page.host.querySelector<HTMLTextAreaElement>('textarea')!.value, '保留这段提示词切模式')
    assert.equal(page.host.querySelectorAll('.refs > span').length, 2)
    assert.equal(page.host.querySelector('[aria-label="图像规格"]'), null, '不再合并折叠规格')
    for (const label of ['模型', '比例', '分辨率', '张数']) {
      assert.ok(page.host.querySelector(`[aria-label="${label}"]`), `图像模式平铺显示 ${label}`)
    }
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="张数"]')!.click()); await settle()
    assert.equal(page.host.querySelectorAll('[data-cp-option]').length, 4, '图像模式张数 1-4')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="3 张"]')!.click()); await settle()
    assert.equal(page.host.querySelector('[aria-label="张数"]')?.textContent, '3 张')

    // 3. 切到视频模式：保留文字与 2 张图，提示只用第 1 张作首帧，比例锁「跟随首帧」，支持无词图生视频与 15s
    await act(async () => modeBtn().click()); await settle()
    await act(async () => optionStartsWith(page.host, '视频').click()); await settle()
    assert.equal(page.host.querySelector<HTMLTextAreaElement>('textarea')!.value, '保留这段提示词切模式')
    assert.ok(page.host.textContent?.includes('仅使用第 1 张'), '多于 1 张时提示只用首张')
    const videoRatio = page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!
    assert.equal(videoRatio.disabled, true)
    assert.ok(videoRatio.textContent?.includes('跟随首帧'))
    for (const label of ['清晰度', '时长']) {
      assert.ok(page.host.querySelector(`[aria-label="${label}"]`), `视频模式平铺显示 ${label}`)
    }
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="时长"]')!.click()); await settle()
    for (const sec of ['6 秒', '10 秒', '15 秒']) assert.ok(page.host.querySelector(`[aria-label="${sec}"]`))
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="15 秒"]')!.click()); await settle()
    assert.equal(page.host.querySelector('[aria-label="时长"]')?.textContent, '15s')

    // 清空文字但仍有首帧图时，允许直接发送图生视频，且只提交第 1 张
    await typeText(page.host, '')
    const sendBtn = page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!
    assert.equal(sendBtn.disabled, false, '有首帧图时允许无文字图生视频')
    await act(async () => sendBtn.click()); await settle()
    assert.equal(calls.length, 3)
    assert.equal(calls[2].mode, 'video')
    assert.equal(calls[2].attachments.length, 1)
    assert.equal(calls[2].attachments[0].id, 'u1')
    assert.equal(calls[2].generation.duration, 15)
    assert.equal(calls[2].generation.modelId, 'grok-imagine-video')

    // 4. 无首帧图的视频模式：比例解锁可选，无文字时置灰，输入文字后可发送文生视频
    await page.close()
    page = await mount(<Harness projectId="proj-1" initial={[]} />)
    assert.equal(modeBtn().textContent, '视频', '项目记住视频模式')
    const ratioUnlocked = page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!
    assert.equal(ratioUnlocked.disabled, false, '无首帧时可自由选比例')
    assert.equal(page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.disabled, true, '无图无词时置灰')
    await typeText(page.host, '阳光洒在丝绸面料上的微距镜头')
    assert.equal(page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!.disabled, false, '有词可文生视频')

    // 5. 新建另一项目默认 Agent；旧会话 direct 恢复为图像
    await page.close()
    page = await mount(<Harness projectId="proj-2" />)
    assert.equal(modeBtn().textContent, 'Agent')
    localStorage.setItem(composerModeKey('test-user', 'proj-legacy'), JSON.stringify('direct'))
    await page.close()
    page = await mount(<Harness projectId="proj-legacy" />)
    assert.equal(modeBtn().textContent, '图像')
  } finally { await page.close(); localStorage.clear(); sessionStorage.clear() }
})

test('compact add menu still opens the file chooser synchronously from upload click', async () => {
  ;({ Composer } = await import('./composer'))
  const { pickFiles } = await import('./ui')
  const page = await mount(<Composer hero attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
  const original = browser.HTMLInputElement.prototype.click
  let clicked = false
  browser.HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') { clicked = true; this.dispatchEvent(new browser.Event('cancel')) }
    else original.call(this)
  }
  try {
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="添加图片"]')!.click()); await settle()
    const upload = [...page.host.querySelectorAll('button')].find(element => element.textContent?.startsWith('上传图片'))
    assert.ok(upload)
    await act(async () => { upload.click(); assert.equal(clicked, true) })
    assert.deepEqual(await pickFiles(), [])
  } finally { browser.HTMLInputElement.prototype.click = original; await page.close() }
})

test('模型选择栏与模型偏好弹层为各模型渲染对应的品牌图标', async () => {
  const { ComposerParameters } = await import('./composer-parameters')
  const { composerOptions, defaultGeneration } = await import('@/lib/v2/composer-options')
  const { modelIconName } = await import('./icons')
  const opts = composerOptions()
  let panel: 'prefs' | 'model' = 'prefs'
  let page = await mount(
    <ComposerParameters
      panel={panel}
      options={opts}
      generation={defaultGeneration}
      mode="agent"
      onGenerationChange={() => {}}
      onModeChange={() => {}}
      onPanelChange={() => {}}
      onClose={() => {}}
    />,
  )
  try {
    const prefsRows = [...page.host.querySelectorAll<HTMLButtonElement>('.cp-prefs-row')]
    assert.equal(prefsRows.length, opts.models.length)
    for (const [index, item] of opts.models.entries()) {
      const icon = prefsRows[index]?.querySelector('svg')
      assert.ok(icon, `prefs 行 ${item.id} 应包含图标`)
      assert.equal(icon.getAttribute('data-icon'), modelIconName(item.id))
      assert.notEqual(icon.getAttribute('data-icon'), 'sparkles')
    }

    await page.close()
    panel = 'model'
    page = await mount(
      <ComposerParameters
        panel={panel}
        options={opts}
        generation={defaultGeneration}
        mode="image"
        onGenerationChange={() => {}}
        onModeChange={() => {}}
        onPanelChange={() => {}}
        onClose={() => {}}
      />,
    )
    await act(async () => { page.host.querySelector<HTMLButtonElement>('.cp-segments button:nth-child(2)')?.click() }); await settle()
    const modelRows = [...page.host.querySelectorAll<HTMLButtonElement>('.cp-options [data-cp-option]')]
    assert.equal(modelRows.length, opts.models.length)
    for (const [index, item] of opts.models.entries()) {
      const icon = modelRows[index]?.querySelector('svg')
      assert.ok(icon, `model 行 ${item.id} 应包含图标`)
      assert.equal(icon.getAttribute('data-icon'), modelIconName(item.id))
    }
  } finally { await page.close() }
})

test('画布视频入口预填视频模式并将指定图置为首帧，不自动触发发送', async () => {
  ;({ Composer } = await import('./composer'))
  const image = { id: 'canvas-frame', url: '/frame.png', width: 100, height: 200 }
  let sends = 0
  function VideoPrefillHarness() {
    const [atts, setAtts] = useState<ChatAttachment[]>([])
    return (
      <Composer
        attachments={atts}
        onAttachmentsChange={setAtts}
        onSend={() => { sends++ }}
        prefill={{ id: 'from-canvas', text: '', mode: 'video', firstFrame: { kind: 'canvas', id: 'node', label: '画布图', image } }}
      />
    )
  }
  const page = await mount(<VideoPrefillHarness />)
  try {
    assert.equal(page.host.querySelector('[aria-label="模式"]')?.textContent, '视频')
    assert.equal(page.host.querySelector('.refs img')?.getAttribute('src'), '/frame.png')
    assert.equal(sends, 0)
  } finally { await page.close() }
})
