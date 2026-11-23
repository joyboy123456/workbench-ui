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
  const { MemoryRouter } = await import('react-router')
  const { createRoot } = await import('react-dom/client')
  const { V2Provider } = await import('@/lib/v2/data-source')
  const { V2AuthProvider } = await import('./auth')
  const { ToastProvider } = await import('./ui')
  const source = { ...createMockDataSource({ pause: async () => {} }), getSession: async () => ({ id: 'test-user', username: 'test-user', displayName: '测试账号' }) }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(<MemoryRouter><V2Provider source={source}><ToastProvider><V2AuthProvider>{child}</V2AuthProvider></ToastProvider></V2Provider></MemoryRouter>) })
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

test('首页首次默认 Agent，三模式统一保留分段切换器并按账号记住上次选择', async () => {
  ;({ Composer } = await import('./composer'))
  localStorage.clear(); sessionStorage.clear()
  let page = await mount(<Composer hero attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
  try {
    const modes = () => Array.from(page.host.querySelectorAll<HTMLButtonElement>('[aria-label="创作模式"] button'))
    const selectedMode = () => modes().find(button => button.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label')
    assert.deepEqual(modes().map(button => button.getAttribute('aria-label')), ['Agent', '图像', '视频'])
    assert.equal(selectedMode(), 'Agent')
    assert.equal(page.host.querySelector('.cp-control-mode'), null)

    // 视频 -> 图像 -> Agent 连续切换，中间图像模式保持同一组三段式切换组件
    await act(async () => modes().find(button => button.getAttribute('aria-label') === '视频')!.click())
    await settle()
    assert.equal(selectedMode(), '视频')
    assert.match(page.host.querySelector('[aria-label="比例"]')?.textContent ?? '', /16:9/, 'auto 无首帧时按钮显示实际发送的 16:9')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!.click()); await settle()
    assert.ok(page.host.querySelector<HTMLButtonElement>('[aria-label="自动（16:9）"]')!.className.includes('on'), '参考图模式默认自动 16:9')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="自动（16:9）"]')!.click()); await settle()
    assert.deepEqual(modes().map(button => button.getAttribute('aria-label')), ['Agent', '图像', '视频'])

    await act(async () => modes().find(button => button.getAttribute('aria-label') === '图像')!.click())
    await settle()
    assert.equal(selectedMode(), '图像')
    assert.deepEqual(modes().map(button => button.getAttribute('aria-label')), ['Agent', '图像', '视频'])
    assert.equal(page.host.querySelector('.cp-control-mode'), null, '首页图像模式不退化为下拉按钮')
    assert.ok(page.host.querySelector('button[aria-label="图像规格"]'))
    assert.ok(page.host.querySelector('button[aria-label="模型"]'))

    // 各模式弹层（图像规格、模型等）统一固定向上弹出（data-side="top"），不向下翻转
    for (const label of ['图像规格', '模型', '添加图片']) {
      await act(async () => page.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
      await settle()
      const pop = document.querySelector<HTMLElement>('.composer-pop')
      assert.ok(pop, `${label} 弹层已打开`)
      assert.equal(pop.getAttribute('data-side'), 'top', `${label} 弹层固定向上弹出`)
      await act(async () => page.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
      await settle()
    }

    await act(async () => modes().find(button => button.getAttribute('aria-label') === 'Agent')!.click())
    await settle()
    assert.equal(selectedMode(), 'Agent')

    await act(async () => modes().find(button => button.getAttribute('aria-label') === '图像')!.click())
    await settle()
    await page.close()
    page = await mount(<Composer hero attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
    assert.equal(selectedMode(), '图像', '回到首页记住上次选的模式')
    assert.deepEqual(modes().map(button => button.getAttribute('aria-label')), ['Agent', '图像', '视频'])
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
            attachments: submission.videoAttachments ?? composerAttachments(mode, atts, submission.firstFrame),
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

    // 2. 切到图像模式：不清空文字和已传的两张图，模型独立，比例、清晰度和张数合并
    await typeText(page.host, '保留这段提示词切模式')
    await act(async () => modeBtn().click()); await settle()
    await act(async () => optionStartsWith(page.host, '图像').click()); await settle()
    assert.equal(page.host.querySelector<HTMLTextAreaElement>('textarea')!.value, '保留这段提示词切模式')
    assert.equal(page.host.querySelectorAll('.refs > span').length, 2)
    const spec = page.host.querySelector<HTMLButtonElement>('button[aria-label="图像规格"]')!
    assert.ok(spec.compareDocumentPosition(page.host.querySelector('button[aria-label="模型"]')!) & Node.DOCUMENT_POSITION_FOLLOWING)
    await act(async () => spec.click()); await settle()
    assert.ok(page.host.querySelector('[aria-label="2K"]'))
    assert.ok(page.host.querySelector('[aria-label="1:1"]'))
    assert.equal(page.host.querySelectorAll('[aria-label="生成张数"] button').length, 4)
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="3 张"]')!.click()); await settle()
    assert.match(spec.textContent ?? '', /· 3张$/)
    await act(async () => [...page.host.querySelectorAll('button')].find(button => button.textContent === '完成')!.click()); await settle()

    // 3. 切到视频模式：保留文字与两张参考图，验证参考图与首尾帧的比例规则
    await act(async () => modeBtn().click()); await settle()
    await act(async () => optionStartsWith(page.host, '视频').click()); await settle()
    const videoModel = () => page.host.querySelector<HTMLButtonElement>('[aria-label="视频模型"]')!
    assert.match(videoModel().textContent ?? '', /Grok Imagine Video/)
    assert.equal(page.host.querySelector<HTMLTextAreaElement>('textarea')!.value, '保留这段提示词切模式')
    assert.equal(page.host.querySelectorAll('.cp-video-slot img').length, 2)
    const videoRatio = page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!
    assert.equal(videoRatio.disabled, false, '参考图模式可手选比例')
    await act(async () => videoRatio.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="9:16"]')!.click()); await settle()
    assert.match(videoRatio.textContent ?? '', /9:16/)
    const frames = () => [...page.host.querySelectorAll<HTMLButtonElement>('.cp-video-image-modes button')].find(b => b.textContent === '首帧')!
    await act(async () => frames().click()); await settle()
    assert.equal(videoRatio.disabled, false, 'Grok 支持手选首帧视频比例')
    for (const label of ['视频模型', '清晰度', '时长']) {
      assert.ok(page.host.querySelector(`[aria-label="${label}"]`), `视频模式平铺显示 ${label}`)
    }
    assert.equal(videoModel().querySelector('svg')?.getAttribute('data-icon'), 'model-grok')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="时长"]')!.click()); await settle()
    for (const sec of ['6 秒', '10 秒', '15 秒']) assert.ok(page.host.querySelector(`[aria-label="${sec}"]`))
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="15 秒"]')!.click()); await settle()
    assert.equal(page.host.querySelector('[aria-label="时长"]')?.textContent, '15s')

    // Grok 首帧模式可无词提交，第二张参考图不进入提交。
    await typeText(page.host, '')
    const sendBtn = page.host.querySelector<HTMLButtonElement>('[aria-label="发送"]')!
    assert.equal(sendBtn.disabled, false)
    await act(async () => sendBtn.click()); await settle()
    assert.equal(calls.length, 3)
    assert.equal(calls[2].mode, 'video')
    assert.deepEqual(calls[2].attachments.map(item => item.id), ['u1'])
    assert.equal(calls[2].attachments[0].id, 'u1')
    assert.equal(calls[2].generation.duration, 15)
    assert.equal(calls[2].generation.modelId, 'grok-imagine-video')
    assert.equal(calls[2].generation.imageMode, 'frames')

    // 4. 无首帧图的视频模式：比例解锁可选，无文字时置灰，输入文字后可发送文生视频
    await page.close()
    page = await mount(<Harness projectId="proj-1" initial={[]} />)
    assert.equal(modeBtn().textContent, '视频', '项目记住视频模式')
    const ratioUnlocked = page.host.querySelector<HTMLButtonElement>('[aria-label="比例"]')!
    await act(async () => frames().click()); await settle()
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
  const { defaultVideoGeneration, SELECTABLE_VIDEO_MODELS } = await import('@/lib/v2/video-options')
  const { modelIconName } = await import('./icons')
  const opts = composerOptions()
  let panel: 'prefs' | 'model' | 'video-model' = 'prefs'
  let page = await mount(
    <ComposerParameters
      panel={panel}
      options={opts}
      generation={defaultGeneration}
      video={defaultVideoGeneration}
      mode="agent"
      onGenerationChange={() => {}}
      onVideoChange={() => {}}
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
      const iconName = icon.getAttribute('data-icon') ?? ''
      assert.equal(iconName, modelIconName(item.id))
      assert.equal(iconName.startsWith('model-'), true, `${item.id} 应使用专属品牌图标而非通用占位图标 (${iconName})`)
    }

    await act(async () => { page.host.querySelectorAll<HTMLButtonElement>('.cp-prefs-seg button')[1]?.click() }); await settle()
    const videoPrefsRows = [...page.host.querySelectorAll<HTMLButtonElement>('.cp-prefs-row')]
    assert.equal(videoPrefsRows.length, SELECTABLE_VIDEO_MODELS.length)
    for (const [index, item] of SELECTABLE_VIDEO_MODELS.entries()) {
      const icon = videoPrefsRows[index]?.querySelector('svg')
      assert.ok(icon, `视频 prefs 行 ${item.id} 应包含图标`)
      const iconName = icon.getAttribute('data-icon') ?? ''
      assert.equal(iconName, modelIconName(item.id))
      assert.equal(iconName.startsWith('model-'), true, `${item.id} 应使用专属品牌图标而非通用占位图标 (${iconName})`)
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

    await page.close()
    panel = 'video-model'
    page = await mount(
      <ComposerParameters
        panel={panel}
        options={opts}
        generation={defaultGeneration}
        video={defaultVideoGeneration}
        mode="video"
        onGenerationChange={() => {}}
        onVideoChange={() => {}}
        onModeChange={() => {}}
        onPanelChange={() => {}}
        onClose={() => {}}
      />,
    )
    await act(async () => { page.host.querySelector<HTMLButtonElement>('.cp-segments button:nth-child(2)')?.click() }); await settle()
    const videoRows = [...page.host.querySelectorAll<HTMLButtonElement>('.cp-options [data-cp-option]')]
    assert.equal(videoRows.length, SELECTABLE_VIDEO_MODELS.length)
    for (const [index, item] of SELECTABLE_VIDEO_MODELS.entries()) {
      const icon = videoRows[index]?.querySelector('svg')
      assert.ok(icon, `video-model 行 ${item.id} 应包含图标`)
      const iconName = icon.getAttribute('data-icon') ?? ''
      assert.equal(iconName, modelIconName(item.id))
      assert.equal(iconName.startsWith('model-'), true)
    }
  } finally { await page.close() }

  // 验证模型选择器的外层触发控件（图像模型按钮、视频模型按钮、Agent 自定义模型偏好按钮）实时同步对应品牌图标
  ;({ Composer } = await import('./composer'))
  localStorage.clear(); sessionStorage.clear()
  const composerMount = await mount(<Composer hero projectId="proj-icon-ctl" attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />)
  try {
    // 1) Agent 模式：默认自动为 toolbox；在模型偏好中选择 Midjourney V8.1 后，触发控件立即切换为 model-midjourney
    const prefsBtn = () => composerMount.host.querySelector<HTMLButtonElement>('[aria-label="模型偏好"]')!
    assert.equal(prefsBtn().querySelector('svg')?.getAttribute('data-icon'), 'toolbox')
    await act(async () => prefsBtn().click()); await settle()
    const mjPref = [...document.querySelectorAll<HTMLButtonElement>('.cp-prefs-row')].find(btn => btn.textContent?.includes('Midjourney V8.1'))
    assert.ok(mjPref, '模型偏好中应包含 Midjourney V8.1')
    await act(async () => mjPref!.click()); await settle()
    assert.equal(prefsBtn().querySelector('svg')?.getAttribute('data-icon'), 'model-midjourney')

    // 2) 切到图像模式：模型选择器控件本身渲染 model-midjourney；切换 Seedream 5.0 Lite 后变为 model-seedream
    await act(async () => composerMount.host.querySelector<HTMLButtonElement>('.cp-hero-modes button[aria-label="图像"]')!.click()); await settle()
    const imgModelBtn = () => composerMount.host.querySelector<HTMLButtonElement>('[aria-label="模型"]')!
    assert.equal(imgModelBtn().querySelector('svg')?.getAttribute('data-icon'), 'model-midjourney')
    await act(async () => imgModelBtn().click()); await settle()
    await act(async () => document.querySelector<HTMLButtonElement>('.cp-segments button:nth-child(2)')?.click()); await settle()
    const seedreamOpt = [...document.querySelectorAll<HTMLButtonElement>('[data-cp-option]')].find(btn => btn.textContent?.includes('Seedream 5.0 Lite'))
    assert.ok(seedreamOpt, '图像模型选择器应包含 Seedream 5.0 Lite')
    await act(async () => seedreamOpt!.click()); await settle()
    assert.equal(imgModelBtn().querySelector('svg')?.getAttribute('data-icon'), 'model-seedream')

    // 3) 视频模型选择器只展示 Grok 及其品牌图标。
    await act(async () => composerMount.host.querySelector<HTMLButtonElement>('.cp-hero-modes button[aria-label="视频"]')!.click()); await settle()
    const vidModelBtn = () => composerMount.host.querySelector<HTMLButtonElement>('[aria-label="视频模型"]')!
    assert.equal(vidModelBtn().querySelector('svg')?.getAttribute('data-icon'), 'model-grok')
    await act(async () => vidModelBtn().click()); await settle()
    const videoOptions = [...document.querySelectorAll<HTMLButtonElement>('[data-cp-option]')]
    assert.equal(videoOptions.length, 1)
    assert.match(videoOptions[0].textContent ?? '', /Grok Imagine Video/)
  } finally { await composerMount.close(); localStorage.clear(); sessionStorage.clear() }
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
    assert.equal(page.host.querySelector('.cp-video-slot img')?.getAttribute('src'), '/frame.png')
    assert.equal(sends, 0)
  } finally { await page.close() }
})
