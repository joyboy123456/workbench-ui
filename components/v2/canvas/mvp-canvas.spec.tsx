import '../test-dom'
import { afterEach, expect, it, vi } from 'vitest'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource, TOOLS } from '@/lib/v2/mock'
import type { CanvasItem } from '@/lib/v2/types'
import { ToastProvider } from '../ui'
import { Board, type BoardProps } from './board'
import { BatchProvider } from './batch-panel'

const flow = { flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }), screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }), fitView: vi.fn(), viewportInitialized: true }
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Right: 'right' }, SelectionMode: { Partial: 'partial' }, BackgroundVariant: { Dots: 'dots' },
  useReactFlow: () => flow, useViewport: () => ({ x: 0, y: 0, zoom: 1 }), Background: () => null,
  NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, ViewportPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  ReactFlow: ({ children, onNodeContextMenu, onPaneContextMenu }: { children: React.ReactNode; onNodeContextMenu: (event: React.MouseEvent, node: { id: string }) => void; onPaneContextMenu: (event: React.MouseEvent) => void }) => <div>
    <button data-node onContextMenu={event => onNodeContextMenu(event, { id: 'a' })}>测试图片</button>
    <button data-pane onContextMenu={onPaneContextMenu}>空白画布</button>{children}
  </div>,
}))
vi.mock('./image-node', () => ({ nodeTypes: {} }))
vi.mock('./canvas-navigation', () => ({
  CanvasNavigation: () => null, useCanvasFit: () => flow.fitView,
  ArrangeOptions: ({ onArrange }: { onArrange: (mode: 'grid') => void }) => <button onClick={() => onArrange('grid')}>一键整理</button>,
}))

const first: CanvasItem = { id: 'a', ref: { type: 'material', id: 'media' }, image: { id: 'media', url: '/a.png', width: 100, height: 200 }, x: 10, y: 20, w: 100 }
let cleanup: (() => Promise<void>) | undefined
afterEach(async () => { await cleanup?.(); cleanup = undefined; vi.clearAllMocks() })
async function mount(multi = false, tools = TOOLS.filter(tool => tool.id !== 'cutout')) {
  const calls = { run: vi.fn(), chat: vi.fn(), download: vi.fn(), material: vi.fn(), cover: vi.fn(), edit: vi.fn(), video: vi.fn() }
  let snapshot: CanvasItem[] = []
  function Harness() {
    const [items, setItems] = useState([first, { ...first, id: 'b', x: 180 }])
    const [selected, setSelected] = useState(multi ? ['a', 'b'] : ['a'])
    snapshot = items
    const props: BoardProps = { items, selected, tool: 'select', active: true, tools,
      onItems: setItems, onSelect: setSelected, onRunTool: calls.run, onEditTool() {}, onEditChat() {}, onBeginMove() {}, onEndMove() {},
      onAddToChat: calls.chat, onDownload: calls.download, onSaveMaterial: calls.material, onSetCover: calls.cover,
      onImageEdit: calls.edit, onVideo: calls.video, onPreview() {}, onCompare() {}, onDropAsset() {}, onDropFiles() {}, onUpload() {} }
    return <BatchProvider projectId="test" items={items} tools={tools} prepare={async () => {}} onEvent={() => {}}><Board {...props} /></BatchProvider>
  }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<V2Provider source={createMockDataSource()}><ToastProvider><Harness /></ToastProvider></V2Provider>))
  cleanup = async () => { await act(async () => root.unmount()); host.remove() }
  const click = async (label: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')].find(b => b.textContent?.trim() === label)
      ?? host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)
    expect(button, label).toBeTruthy()
    await act(async () => button!.click())
  }
  const context = async (selector = '[data-node]') => {
    await act(async () => host.querySelector(selector)!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 120 })))
  }
  return { host, calls, click, context, items: () => snapshot }
}

it('单图横条逐项打开正确的面板或选项，缺口面板禁止伪提交', async () => {
  const page = await mount()
  for (const [label, heading] of [['AI扩图', '扩图改比例'], ['智能消除', '智能消除'], ['局部修改', '局部修改'], ['图层拆分', '图层拆分'], ['物体移动', '物体移动']]) {
    await page.click(label)
    expect(page.host.querySelector('.tpn-hd')?.textContent).toContain(heading)
    if (['图层拆分', '物体移动'].includes(label)) expect(page.host.querySelector<HTMLButtonElement>('.tpn-go')?.disabled).toBe(true)
  }
  await page.click('文字编辑'); await page.click('文字编辑')
  expect(page.host.querySelector('.tpn')?.textContent).toContain('即将上线')
  expect(page.host.querySelector<HTMLButtonElement>('.tpn-go')?.disabled).toBe(true)
  await page.click('超清放大'); await page.click('2 倍约 2K')
  expect(page.calls.run).toHaveBeenCalledWith('upscale:2x', ['a'])
  await page.click('反推提示词'); await page.click('反推提示词')
  expect(page.calls.run).toHaveBeenCalledWith('describe', ['a'])
  expect(page.host.querySelector('[aria-label="一键抠图"]')).toBeNull()
})

it('单图侧栏裁剪/调色实际传递编辑参数，聊天和视频传递当前图', async () => {
  const page = await mount()
  for (const [label, kind] of [['裁剪', 'crop'], ['调色', 'adjust']] as const) {
    await page.click(label); await page.click('另存为新图')
    expect(page.calls.edit).toHaveBeenLastCalledWith(['a'], expect.objectContaining({ kind }))
  }
  await page.click('添加到聊天'); expect(page.calls.chat).toHaveBeenCalledWith(['a'])
  await page.click('生成视频'); expect(page.calls.video).toHaveBeenCalledWith('a')
})

it('尺寸输入等比变化、解除比例锁、提交和分辨率锁彼此独立', async () => {
  const page = await mount()
  const input = page.host.querySelector<HTMLInputElement>('[aria-label="图片宽度"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, '50')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  // React's input event bridge is exercised in Chromium; submit also validates at the boundary.
  await page.click('锁定宽高比')
  expect(page.items()[0].aspectRatioLocked).toBe(false)
  await page.click('锁定分辨率')
  expect(page.items()[0].resolutionLocked).toBe(true)
  expect(input.disabled).toBe(true)
  expect(page.host.querySelector<HTMLButtonElement>('[aria-label="应用尺寸"]')?.disabled).toBe(true)
})

it('图片右键 9 项逐个触发，四种层序可到达，位置锁不被分辨率锁改变', async () => {
  const page = await mount()
  await page.click('更多工具'); await page.click('锁定位置')
  expect(page.items()[0].locked).toBe(true)
  await page.click('更多工具'); await page.click('解除位置锁定')
  expect(page.items()[0].locked).toBe(false)
  await page.context()
  expect(page.host.querySelectorAll('[aria-label="图片右键菜单"] [role^="menuitem"]')).toHaveLength(9)
  for (const [label, callback, args] of [
    ['复制Ctrl C', null, null], ['下载无损原图', page.calls.download, [['a'], 'original']], ['下载预览 WebP', page.calls.download, [['a'], 'webp']],
    ['添加到素材库', page.calls.material, [['a']]], ['设为封面', page.calls.cover, ['a']], ['添加到聊天', page.calls.chat, [['a']]],
  ] as const) {
    await page.context(); await page.click(label)
    if (callback) expect(callback).toHaveBeenCalledWith(...args!)
  }
  await page.context(); await page.click('锁定分辨率Ctrl Alt L')
  expect(page.items()[0].resolutionLocked).toBe(true); expect(page.items()[0].locked).toBe(false)
  for (const label of ['置顶Ctrl Shift ]', '上移Ctrl ]', '下移Ctrl [', '置底Ctrl Shift [']) {
    await page.context(); await page.click('图层顺序›'); await page.click(label)
    expect(page.items()).toHaveLength(2)
  }
  await page.context(); await page.click('删除Delete')
  expect(page.items().map(i => i.id)).toEqual(['b'])
})

it('空白右键展示全部与整理调用现有视口和布局操作', async () => {
  const page = await mount()
  await page.context('[data-pane]'); await page.click('展示全部Shift 1')
  expect(flow.fitView).toHaveBeenCalled()
  await page.context('[data-pane]'); await page.click('一键整理')
  expect(page.host.textContent).toContain('已整理画布')
})

it('多选横条复用批量超清面板，其他缺口禁止执行，侧栏合并与聊天传递全选', async () => {
  const page = await mount(true)
  await page.click('超清放大')
  expect(page.host.querySelector<HTMLSelectElement>('[name="batch-tool"]')?.value).toBe('upscale')
  await page.click('关闭批量处理')
  for (const label of ['多图融合', '物体移动']) {
    await page.click(label)
    expect(page.host.querySelector<HTMLButtonElement>('.tpn-go')?.disabled).toBe(true)
  }
  await page.click('反推提示词'); await page.click('反推提示词')
  expect(page.host.querySelector('.tpn')?.textContent).toContain('暂不支持多选')
  await page.click('调色'); await page.click('另存为新图')
  expect(page.calls.edit).toHaveBeenCalledWith(['a', 'b'], expect.objectContaining({ kind: 'adjust' }))
  await page.click('图层合并'); expect(page.calls.edit).toHaveBeenCalledWith(['a', 'b'], { kind: 'merge' })
  await page.click('添加到聊天'); expect(page.calls.chat).toHaveBeenCalledWith(['a', 'b'])
  expect(page.host.querySelector<HTMLButtonElement>('[aria-label="导出 PSD · 即将上线"]')?.disabled).toBe(true)
})
