import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { V2_DISPLAY } from '@/lib/v2/display-config'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource } from '@/lib/v2/mock'
import type { ToolDef } from '@/lib/v2/types'
import { ToolPanel } from './tool-panel'

Object.defineProperty(globalThis, 'React', { configurable: true, value: React })

const def: ToolDef = { id: 'test-tool', name: '出图', icon: 'image', surfaces: ['selection'], cost: 30,
  fields: [{ id: 'count', label: '张数', kind: 'select', count: true, options: [{ id: '1', label: '1' }, { id: '3', label: '3' }] }] }
function render(count: number, tool = def) {
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(ToolPanel, {
    def: tool, item: { id: 'node', ref: { type: 'material', id: 'asset' }, image: { id: 'asset', url: '/image.png', width: 100, height: 100 }, x: 0, y: 0, w: 100 },
    params: { count }, refChoices: [], hasMask: true, onChange() {}, onClearMask() {}, onClose() {}, onSubmit() {},
  }) }))
  return html.match(/<button class="tpn-go wide"[^>]*>([\s\S]*?)<\/button>/)?.[1]
}

test('trial tool CTA shows only generation and output count, with no credit price', () => {
  assert.equal(render(1), '生成')
  assert.equal(render(3), '生成 · 3 张')
  assert.equal(render(1, { ...def, cost: undefined }), '生成')
})


test('central display switch can restore the original calculated credit price', () => {
  const previous = V2_DISPLAY.showCreditPrices
  try {
    V2_DISPLAY.showCreditPrices = true
    assert.match(render(1) ?? '', /30<\/em>/)
    assert.match(render(3) ?? '', /90<\/em>/)
    assert.match(render(1, { ...def, cost: undefined }) ?? '', /—<\/em>/)
  } finally { V2_DISPLAY.showCreditPrices = previous }
})
