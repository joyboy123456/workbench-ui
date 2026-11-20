import { browser } from './test-dom'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { createMockDataSource, TOOL_CATALOG } from '@/lib/v2/mock'
import { V2Provider, type V2DataSource } from '@/lib/v2/data-source'
import { V2AuthProvider } from './auth'
import { ToastProvider } from './ui'
import { Shell } from './shell'
import { ProjectsPage } from './projects-page'
import { AssetsPage } from './assets-page'
import { useStartTool } from './tools-page'
import { Composer } from './composer'

const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
const base = () => createMockDataSource({ pause: async () => {} })
const signedIn = () => ({ id: 'test-user', username: 'test-user', displayName: '测试账号' })
async function mount(child: React.ReactNode, overrides: Partial<V2DataSource> = {}, path = '/v2', search = '') {
  const routes: string[] = []
  const source: V2DataSource = { ...base(), getSession: async () => signedIn(), listActiveTasks: async () => [], ...overrides }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  const router = { push: (href: string) => { routes.push(href) }, replace() {}, refresh() {}, back() {}, forward() {}, prefetch: async () => {} }
  await act(async () => { root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams(search)}><V2Provider source={source}><ToastProvider><V2AuthProvider>{child}</V2AuthProvider></ToastProvider></V2Provider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>) })
  await settle()
  return { host, routes, close: async () => { await act(async () => root.unmount()); host.remove() } }
}
const button = (host: HTMLElement, text: string) => {
  const found = [...host.querySelectorAll('button')].find(element => element.textContent?.trim() === text)
  assert.ok(found, `button ${text} is present`); return found
}

test('login button opens the auth dialog and topbar is above overlapping home content', async () => {
  const page = await mount(<Shell><div className="hm-top" /></Shell>, { getSession: async () => null })
  try {
    await act(async () => button(page.host, '登录').click())
    assert.equal(page.host.querySelector('dialog')?.open, true)
    const css = readFileSync('app/v2/v2.css', 'utf8')
    assert.match(css, /\.v2 \.guest-topbar\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*10/)
  } finally { await page.close() }
})

test('project list and sidebar prevent duplicate creation and navigate to split canvas', async () => {
  for (const [child, selector] of [[<Shell key="sidebar">test</Shell>, '.rail-create'], [<ProjectsPage key="projects" />, '.pc.add'], [<ProjectsPage key="empty" />, '.empty .btn']] as const) {
    let resolve!: (project: Awaited<ReturnType<V2DataSource['createProject']>>) => void
    let calls = 0
    const pending = new Promise<Awaited<ReturnType<V2DataSource['createProject']>>>(done => { resolve = done })
    const page = await mount(child, { listProjects: async () => [], createProject: async () => { calls++; return pending } })
    try {
      const create = page.host.querySelector<HTMLButtonElement>(selector)
      assert.ok(create)
      await act(async () => { create.click(); create.click() })
      assert.equal(calls, 1); assert.equal(create.disabled, true)
      await act(async () => resolve({ id: 'created', name: '未命名项目', productIds: [], updatedAt: '' }))
      assert.deepEqual(page.routes, ['/v2/canvas/created?view=split'])
      assert.equal(create.disabled, true)
      await act(async () => create.click())
      assert.equal(calls, 1)
    } finally { await page.close() }
  }
})

test('guest creation opens login without creating any project', async () => {
  let calls = 0
  const page = await mount(<ProjectsPage />, { getSession: async () => null, createProject: async () => { calls++; throw new Error('must not create') } })
  try {
    await act(async () => page.host.querySelector<HTMLButtonElement>('.pc.add')!.click())
    assert.equal(calls, 0); assert.equal(page.host.querySelector('dialog')?.open, true)
  } finally { await page.close() }
})

function ToolEntry() {
  const { start, busy } = useStartTool()
  return <button onClick={() => { void start(TOOL_CATALOG.find(tool => tool.status === 'ready')!) }}>{busy ? '打开中…' : '打开工具'}</button>
}
test('tool entry navigates without chooser, and creation failure is visible and recoverable', async () => {
  let fail = true
  const page = await mount(<ToolEntry />, { createProject: async () => {
    if (fail) throw new Error('项目创建失败')
    return { id: 'tool-project', name: '', productIds: [], updatedAt: '' }
  } })
  try {
    await act(async () => button(page.host, '打开工具').click())
    assert.match(page.host.textContent ?? '', /项目创建失败/)
    fail = false
    await act(async () => button(page.host, '打开工具').click())
    assert.match(page.routes[0], /^\/v2\/canvas\/tool-project\?view=split&tool=/)
  } finally { await page.close() }
})

test('successful product upload closes modal, reloads products/categories, and blocks repeated completion', async () => {
  let resolve!: (product: Awaited<ReturnType<V2DataSource['uploadProduct']>>) => void
  const pending = new Promise<Awaited<ReturnType<V2DataSource['uploadProduct']>>>(done => { resolve = done })
  let creates = 0, reads = 0, categories = 0
  const page = await mount(<AssetsPage />, {
    listProducts: async () => { reads++; return [] }, listCategories: async () => { categories++; return [{ id: 'cat', name: 'T恤', count: creates }] },
    uploadProduct: async () => { creates++; return pending },
  }, '/v2/assets', 'tab=products')
  const original = browser.HTMLInputElement.prototype.click
  browser.HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return original.call(this)
    Object.defineProperty(this, 'files', { value: [new browser.File(['image'], 'shirt.png', { type: 'image/png' })] })
    this.dispatchEvent(new browser.Event('change'))
  }
  try {
    await act(async () => button(page.host, '上传商品').click()); await settle()
    await act(async () => page.host.querySelector<HTMLElement>('.drop')!.click())
    await act(async () => { button(page.host, '完成').click(); button(page.host, '完成').click() })
    assert.equal(creates, 1); assert.equal(button(page.host, '上传中…').disabled, true)
    const before = [reads, categories]
    await act(async () => resolve({ id: 'product', name: 'T恤', categoryId: 'cat', images: [], generatedCount: 0, projectIds: [], createdAt: '', updatedAt: '' })); await settle()
    assert.equal(page.host.querySelector('[role="dialog"]'), null)
    assert.ok(reads > before[0]); assert.ok(categories > before[1]); assert.equal(creates, 1)
  } finally { browser.HTMLInputElement.prototype.click = original; await page.close() }
})

test('gallery prefill visibly selects the tool and displays its parameter panel', async () => {
  const tools = await base().listTools()
  const tool = tools.find(tool => !tool.overlay && !tool.editor)!
  const page = await mount(<Composer attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} prefill={{ id: 'gallery', text: '', toolId: tool.id }} />, { listTools: async () => tools })
  try { assert.match(page.host.textContent ?? '', new RegExp(tool.name)); assert.match(page.host.textContent ?? '', /源图：/) }
  finally { await page.close() }
})

test('authenticated shell always has an actionable account menu and logout', async () => {
  let exits = 0
  const page = await mount(<Shell>content</Shell>, { logout: async () => { exits++ } })
  try {
    const account = page.host.querySelector<HTMLButtonElement>('.account-trigger')
    assert.ok(account, 'top-right account button must remain after session initialization')
    await act(async () => account.click())
    assert.match(page.host.textContent ?? '', /退出登录/)
    await act(async () => button(page.host, '退出登录').click())
    assert.equal(exits, 1)
    assert.ok(button(page.host, '登录'))
  } finally { await page.close() }
})

test('temporary cold-session failure recovers on focus without reloading the page', async () => {
  let reads = 0
  const page = await mount(<Shell>content</Shell>, { getSession: async () => { if (++reads === 1) throw new Error('cold'); return signedIn() } })
  try {
    assert.ok(page.host.querySelector('[aria-label="正在确认登录状态"]'))
    await act(async () => browser.dispatchEvent(new browser.Event('focus')))
    assert.ok(page.host.querySelector('[aria-label="账号菜单：测试账号"]'))
  } finally { await page.close() }
})

test('composer + upload disables send until upload completes and announces success', async () => {
  function Input() { const [attachments, setAttachments] = useState<Parameters<typeof Composer>[0]['attachments']>([]); return <Composer hero attachments={attachments} onAttachmentsChange={setAttachments} onSend={() => {}} /> }
  let finish!: (value: Awaited<ReturnType<NonNullable<V2DataSource['uploadChatAttachment']>>>) => void
  const pending = new Promise<Awaited<ReturnType<NonNullable<V2DataSource['uploadChatAttachment']>>>>(resolve => { finish = resolve })
  const page = await mount(<Input />, { uploadChatAttachment: async () => pending })
  const original = browser.HTMLInputElement.prototype.click
  browser.HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return original.call(this)
    assert.ok(this.isConnected)
    Object.defineProperty(this, 'files', { value: [new browser.File(['test'], 'shirt.png', { type: 'image/png' })] })
    this.dispatchEvent(new browser.Event('change'))
  }
  try {
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="添加图片"]')!.click())
    await settle()
    const target = [...document.querySelectorAll<HTMLButtonElement>('.composer-pop button')].find(element => element.textContent?.includes('上传图片'))
    assert.ok(target, 'upload target in + menu')
    await act(async () => target.click())
    assert.equal(page.host.querySelector<HTMLButtonElement>('.go')?.disabled, true)
    await act(async () => finish({ kind: 'upload', id: 'new', label: 'shirt.png', image: { id: 'new', url: '/test.png', width: 800, height: 1000 } }))
    assert.equal(page.host.querySelector<HTMLButtonElement>('.go')?.disabled, false)
    assert.match(page.host.textContent ?? '', /已上传 1 张图片/)
  } finally { browser.HTMLInputElement.prototype.click = original; await page.close() }
})
