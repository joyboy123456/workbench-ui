import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource, TOOLS } from '@/lib/v2/mock'
import type { CanvasItem, ToolDef } from '@/lib/v2/types'
import { BatchPanel } from './batch-panel'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

const items = (n: number): CanvasItem[] => Array.from({ length: n }, (_, i) => ({
  id: String(i), ref: { type: 'material', id: String(i) }, image: { id: String(i), url: '/image.png', width: 1000, height: 1500 },
  x: 0, y: i * 200, w: 100, status: 'done',
}))
function render(selection: CanvasItem[], tools: ToolDef[]) {
  return renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(BatchPanel, {
    items: selection, canvasItems: selection, tools, busy: false, onRun() {}, onClose() {},
  }) }))
}

test('批量扩图直接显示比例与张数，并保留每张执行数量和源图落点说明', () => {
  const html = render(items(3), TOOLS.filter(tool => tool.id === 'outpaint'))
  assert.match(html, /目标比例/)
  assert.match(html, /3:4/)
  assert.match(html, /张数/)
  assert.match(html, /对 3 张执行/)
  assert.match(html, /每张结果放在各自源图右侧/)
  assert.doesNotMatch(html, /<details/)
  assert.doesNotMatch(html, /disabled=""/)
})

test('超限执行按钮禁用且原因可见；未完成图明确排除', () => {
  const html = render(items(21), TOOLS)
  assert.match(html, /一次最多 20 张/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>对 21 张执行/)
  const mixed = items(3)
  mixed[0].status = 'failed'
  mixed[1].status = 'running'
  const filtered = render(mixed, TOOLS)
  assert.match(filtered, /已排除 2 张未完成图片/)
  assert.match(filtered, /对 1 张执行/)
})

test('目录为空或无需参数时区块均保留，不展示蒙版工具', () => {
  const empty = render(items(2), [])
  assert.match(empty, /处理工具/)
  assert.match(empty, /工具参数/)
  assert.match(empty, /当前没有可批量处理的工具/)
  const noFields = render(items(2), TOOLS.filter(tool => tool.id === 'cutout'))
  assert.match(noFields, /无需额外参数，将逐张处理/)
  const all = render(items(2), TOOLS)
  assert.doesNotMatch(all, /<option value="(?:erase|inpaint)"/)
})

test('需要第二张必填图片的工具不出现在批量目录', () => {
  const html = render(items(2), TOOLS.filter(tool => tool.id === 'try-on-swap'))
  assert.match(html, /当前没有可批量处理的工具/)
  assert.doesNotMatch(html, /<option value="try-on-swap"/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>对 2 张执行/)
})
