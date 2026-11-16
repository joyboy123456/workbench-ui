import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource } from '@/lib/v2/mock'
import type { ChatAttachment } from '@/lib/v2/types'
import { ChatPanel, type ChatPanelProps } from './chat-panel'
import { V2AuthProvider } from '../auth'

function renderMessage(text: string, attachments: ChatAttachment[]) {
  const props: ChatPanelProps = {
    project: { id: 'project', name: '测试项目', productIds: [], updatedAt: '2026-11-16T00:00:00.000Z' },
    messages: [{ id: 'message', role: 'user', text, attachments, createdAt: '2026-11-16T00:00:00.000Z' }],
    attachments: [], canvasImages: [], busy: false, drawerOpen: false, view: 'chat', collapsed: false,
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {}, onExpandCanvas() {},
  }
  return renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
}
const canvas: ChatAttachment = { kind: 'canvas', id: 'canvas-1', label: '画布参考图', image: { id: 'image-1', url: '/canvas-reference.png', width: 640, height: 857 } }

test('chat shows canvas reference thumbnail and label even without a literal mention in submitted text', () => {
  const html = renderMessage('保留商品细节，换成白底', [canvas])
  assert.match(html, /aria-label="引用 画布参考图"/)
  assert.match(html, /<img src="\/canvas-reference.png"/)
  assert.match(html, /<span>画布参考图<\/span>/)
})

test('legacy inline canvas mentions remain visible without a duplicate attachment button', () => {
  const html = renderMessage('用 @画布参考图 做主图', [canvas])
  assert.match(html, /class="ref"/)
  assert.match(html, /src="\/canvas-reference.png"/)
  assert.doesNotMatch(html, /aria-label="引用 画布参考图"/)
})
