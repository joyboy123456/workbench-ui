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

test('chat renders ask-card above composer and result reply metadata', () => {
  const props: ChatPanelProps = {
    project: { id: 'project', name: '测试项目', productIds: [], updatedAt: '2026-11-16T00:00:00.000Z' },
    messages: [
      {
        id: 'a1',
        role: 'assistant',
        createdAt: '2026-11-16T00:00:00.000Z',
        steps: [
          { label: '思考完成', icon: 'think', status: 'done', collapsible: true, detail: '思考摘要' },
        ],
        results: [],
        meta: {
          spec: '3:4 · 1536×2048 · Nano Banana 2',
          highlights: ['保留蕾丝领口'],
          suggestions: ['背景更柔和'],
        },
        body: '生成完成',
      },
      {
        id: 'ask1',
        role: 'ask',
        createdAt: '2026-11-16T00:00:00.000Z',
        reason: '需要确认背景风格',
        question: '选择哪种背景？',
        options: [
          { key: 'A', label: '自然外景' },
          { key: 'B', label: '极简影棚' },
          { key: 'C', label: '复古室内' },
        ],
      },
    ],
    attachments: [], canvasImages: [], busy: false, drawerOpen: false, view: 'chat', collapsed: false,
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {}, onExpandCanvas() {},
  }
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
  assert.match(html, /3:4 · 1536×2048 · Nano Banana 2/)
  assert.match(html, /这一版落实的几点/)
  assert.match(html, /常见调整方向/)
  assert.match(html, /背景更柔和/)
  assert.match(html, /选择哪种背景？/)
  assert.match(html, /ask-card/)
  assert.match(html, /跳过/)
  assert.match(html, /提交/)
})
