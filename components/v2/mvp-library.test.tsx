import { browser } from './test-dom'
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { createMockDataSource } from '@/lib/v2/mock'
import { V2Provider, type V2DataSource } from '@/lib/v2/data-source'
import type { ChatAttachment, Material, MaterialCategory, PromptPreset } from '@/lib/v2/types'
import { V2AuthProvider } from './auth'
import { ToastProvider } from './ui'
import { Composer } from './composer'
import { ProjectsPage } from './projects-page'
import { AssetsPage } from './assets-page'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) }) }
const signedIn = () => ({ id: 'test-user', username: 'test-user', displayName: '测试账号' })
async function mount(child: React.ReactNode, overrides: Partial<V2DataSource> = {}, path = '/v2') {
  const base = createMockDataSource({ pause: async () => {} })
  const source: V2DataSource = { ...base, getSession: async () => signedIn(), listActiveTasks: async () => [], ...overrides }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch: async () => {} }
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={path}><SearchParamsContext.Provider value={new URLSearchParams()}><V2Provider source={source}><ToastProvider><V2AuthProvider>{child}</V2AuthProvider></ToastProvider></V2Provider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>))
  await settle()
  return { host, close: async () => { await act(async () => root.unmount()); host.remove() } }
}
const findButton = (host: HTMLElement, text: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)
  assert.ok(button, `button ${text} is present`); return button
}
const setControlValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof browser.HTMLTextAreaElement ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
function Input() {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  return <><Composer hero attachments={attachments} onAttachmentsChange={setAttachments} onSend={() => {}} /><output data-testid="attachment-count">{attachments.length}</output></>
}

test('输入 * 与 + 菜单复用素材选择器并把素材作为附件', async () => {
  const page = await mount(<Input />)
  try {
    const textarea = page.host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => setControlValue(textarea, '*')); await settle()
    assert.ok(page.host.querySelector('.cp-material-picker'))
    await act(async () => page.host.querySelector<HTMLButtonElement>('.cp-material-picker [role="option"]')!.click()); await settle()
    assert.equal(page.host.querySelector('[data-testid="attachment-count"]')?.textContent, '1')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="添加图片"]')!.click()); await settle()
    await act(async () => findButton(page.host, '素材库选择已保存的素材').click()); await settle()
    assert.ok(page.host.querySelector('.cp-material-picker'))
  } finally { await page.close() }
})

test('固定提示词可插入、新增、编辑和删除', async t => {
  const preset: PromptPreset = { id: 'p1', name: '主图', content: '干净白底商品主图', createdAt: '', updatedAt: '' }
  let created = 0, updated = 0, deleted = 0
  const answers = ['场景', '自然光场景', '新名称', '更新内容']
  const originalPrompt = window.prompt, originalConfirm = window.confirm
  Object.defineProperty(window, 'prompt', { configurable: true, value: () => answers.shift() ?? null })
  Object.defineProperty(window, 'confirm', { configurable: true, value: () => true })
  t.after(() => { Object.defineProperty(window, 'prompt', { configurable: true, value: originalPrompt }); Object.defineProperty(window, 'confirm', { configurable: true, value: originalConfirm }) })
  const page = await mount(<Input />, {
    listPromptPresets: async () => [preset], createPromptPreset: async input => { created++; return { ...preset, ...input } },
    updatePromptPreset: async (_id, input) => { updated++; return { ...preset, ...input } }, deletePromptPreset: async () => { deleted++ },
  })
  try {
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="添加图片"]')!.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="固定提示词"]')!.click()); await settle()
    await act(async () => findButton(page.host, '主图干净白底商品主图').click())
    assert.match(page.host.querySelector('textarea')!.value, /干净白底商品主图/)
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="添加图片"]')!.click()); await settle()
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="固定提示词"]')!.click()); await settle()
    await act(async () => findButton(page.host, '新增').click()); await settle(); assert.equal(created, 1)
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="编辑固定提示词 主图"]')!.click()); await settle(); assert.equal(updated, 1)
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="删除固定提示词 主图"]')!.click()); await settle(); assert.equal(deleted, 1)
  } finally { await page.close() }
})

test('优化提示词可替换当前输入并撤销', async () => {
  const page = await mount(<Composer hero prefill={{ id: 'draft', text: '连衣裙主图' }} attachments={[]} onAttachmentsChange={() => {}} onSend={() => {}} />, {
    optimizePrompt: async text => ({ prompt: `${text}，柔和棚拍光，保留面料细节。` }),
  })
  try {
    assert.equal(page.host.querySelector('textarea')!.value, '连衣裙主图')
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="优化提示词"]')!.click()); await settle()
    assert.match(page.host.querySelector('textarea')!.value, /柔和棚拍光/)
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="撤销提示词优化"]')!.click())
    assert.equal(page.host.querySelector('textarea')!.value, '连衣裙主图')
  } finally { await page.close() }
})

test('项目库按项目名即时过滤', async () => {
  const page = await mount(<ProjectsPage />, { listProjects: async () => [
    { id: 'one', name: '春季连衣裙', productIds: [], updatedAt: '' }, { id: 'two', name: '秋季外套', productIds: [], updatedAt: '' },
  ], listProducts: async () => [] }, '/v2/projects')
  try {
    const search = page.host.querySelector<HTMLInputElement>('[aria-label="搜索项目"]')!
    await act(async () => setControlValue(search, '连衣裙'))
    const gridText = page.host.querySelector('.lv-pgd')?.textContent ?? ''
    assert.match(gridText, /春季连衣裙/)
    assert.doesNotMatch(gridText, /秋季外套/)
  } finally { await page.close() }
})

test('素材库分类、回收站和素材操作控件均可点击', async t => {
  const image = { id: 'img', url: '/v2-mock/c1.jpg', width: 640, height: 857 }
  const material: Material = { id: 'm1', name: '咖啡馆场景', image, origin: 'upload', categoryId: 'c1', createdAt: '' }
  const category: MaterialCategory = { id: 'c1', name: '场景', count: 1, createdAt: '' }
  let categoryCreates = 0, moves = 0, deletes = 0
  const originalPrompt = window.prompt, originalConfirm = window.confirm
  Object.defineProperty(window, 'prompt', { configurable: true, value: () => '新分类' })
  Object.defineProperty(window, 'confirm', { configurable: true, value: () => true })
  t.after(() => { Object.defineProperty(window, 'prompt', { configurable: true, value: originalPrompt }); Object.defineProperty(window, 'confirm', { configurable: true, value: originalConfirm }) })
  const page = await mount(<AssetsPage />, {
    listMaterialCategories: async () => [category], listMaterials: async query => query?.trash ? [{ ...material, deletedAt: '2026-11-18T00:00:00.000Z' }] : [material],
    createMaterialCategory: async name => { categoryCreates++; return { ...category, id: 'new', name } }, moveMaterial: async () => { moves++; return material },
    deleteMaterial: async () => { deletes++ }, restoreMaterial: async () => material,
  }, '/v2/assets')
  try {
    assert.ok(page.host.querySelector('[aria-label="新增素材分类"]'))
    await act(async () => page.host.querySelector<HTMLButtonElement>('[aria-label="新增素材分类"]')!.click()); await settle(); assert.equal(categoryCreates, 1)
    await act(async () => findButton(page.host, '移动分类').click()); await settle(); assert.equal(moves, 0, 'unknown category is rejected before data source mutation')
    await act(async () => findButton(page.host, '删除').click()); await settle(); assert.equal(deletes, 1)
    await act(async () => findButton(page.host, '回收站').click()); await settle()
    assert.ok(findButton(page.host, '恢复')); assert.ok(findButton(page.host, '彻底删除'))
  } finally { await page.close() }
})
