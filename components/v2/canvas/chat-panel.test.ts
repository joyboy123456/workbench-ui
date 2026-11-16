import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource, summarizeProjectTitle } from '@/lib/v2/mock'
import type { CanvasItem, ChatAttachment, ChatMessage } from '@/lib/v2/types'
import { ChatPanel, type ChatPanelProps } from './chat-panel'
import { extractActiveReferences, findCanvasItemForReference, ReferencePanel } from './reference-panel'
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

test('chat renders running result placeholders with target aspect ratio, glow sweep, percentage, and auto-expand switch', () => {
  const props: ChatPanelProps = {
    project: { id: 'project', name: '测试项目', productIds: [], updatedAt: '2026-11-16T00:00:00.000Z' },
    messages: [
      {
        id: 'a_gen',
        role: 'assistant',
        createdAt: '2026-11-16T00:00:00.000Z',
        steps: [{ label: '使用 Nano Banana 2 生成图片', icon: 'image', status: 'done' }],
        results: [
          { id: 'r1', status: 'running', progress: 48, generationPhase: 'generating', targetSize: { width: 1600, height: 900 } },
          { id: 'r2', status: 'done', image: { id: 'img2', url: '/v2-mock/c1.jpg', width: 640, height: 857 }, targetSize: { width: 1600, height: 900 } },
        ],
      },
    ],
    attachments: [], canvasImages: [], busy: true, drawerOpen: false, view: 'chat', collapsed: false,
    autoExpandCanvas: false,
    onAutoExpandCanvasChange() {},
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {}, onExpandCanvas() {},
  }
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
  assert.match(html, /rs-skel node gen wide phase-generating/)
  assert.match(html, /aspect-ratio:1600 \/ 900/)
  assert.match(html, /generation-scan/)
  assert.match(html, /48%/)
  assert.match(html, /生成中/)
  assert.match(html, /data-testid="auto-expand-switch"/)
  assert.match(html, /aria-checked="false"/)
  assert.match(html, /rs-card wide/)
})

test('reference panel extracts active round references across ask replies and hides when empty', () => {
  const productAtt: ChatAttachment = { kind: 'product', id: 'p_lace', label: '蕾丝连衣裙', image: { id: 'img_p', url: '/v2-mock/k-701-look01.jpg', width: 1100, height: 1473 } }
  const modelAtt: ChatAttachment = { kind: 'model', id: 'm_linxi', label: '林夕', image: { id: 'img_m', url: '/v2-mock/k-look05-face.jpg', width: 900, height: 1000 } }
  const msgs: ChatMessage[] = [
    { id: 'u1', role: 'user', text: '帮我出主图', attachments: [productAtt, modelAtt], createdAt: '2026-11-16T00:00:00.000Z' },
    { id: 'ask1', role: 'ask', question: '选风格', options: [{ key: 'A', label: '外景' }], createdAt: '2026-11-16T00:00:00.000Z' },
    { id: 'u2', role: 'user', text: 'Q：选风格 A：外景', attachments: [], createdAt: '2026-11-16T00:00:00.000Z' },
  ]
  const refs = extractActiveReferences(msgs)
  assert.equal(refs.length, 2)
  assert.equal(refs[0].id, 'p_lace')
  assert.equal(refs[1].id, 'm_linxi')

  const plainFollowUp: ChatMessage[] = [
    ...msgs,
    { id: 'u3', role: 'user', text: '再调亮一点', attachments: [], createdAt: '2026-11-16T00:00:00.000Z' },
  ]
  assert.equal(extractActiveReferences(plainFollowUp).length, 0)

  const canvasItems: CanvasItem[] = [
    { id: 'ci_1', ref: { type: 'product', id: 'p_lace', imageId: 'img_p' }, image: productAtt.image, x: 0, y: 0, w: 150 },
  ]
  assert.equal(findCanvasItemForReference(productAtt, canvasItems)?.id, 'ci_1')
  assert.equal(findCanvasItemForReference(modelAtt, canvasItems), undefined)

  const panelHtml = renderToStaticMarkup(createElement(ReferencePanel, {
    references: refs,
    items: canvasItems,
    selectedIds: [],
    onCollapse() {},
    onSelectReference() {},
  }))
  assert.match(panelHtml, /data-testid="reference-panel"/)
  assert.match(panelHtml, /蕾丝连衣裙/)
  assert.match(panelHtml, /定位画布/)
  assert.match(panelHtml, /预览大图/)

  const emptyHtml = renderToStaticMarkup(createElement(ReferencePanel, {
    references: [],
    items: canvasItems,
    selectedIds: [],
    onCollapse() {},
    onSelectReference() {},
  }))
  assert.equal(emptyHtml, '')
})

test('mock first-round reply generates concise project title and preserves manual renames', async () => {
  const ds = createMockDataSource({ pause: async () => {} })
  const title1 = summarizeProjectTitle('这套出 4 张草原主图，模特用林夕', [
    { kind: 'product', id: 'p1', label: '蕾丝荷叶领连衣裙', image: { id: 'i1', url: '/v2-mock/c1.jpg', width: 640, height: 857 } },
  ], 'agent')
  assert.match(title1, /蕾丝荷叶领连衣裙/)
  assert.match(title1, /草原/)

  const project = await ds.createProject({})
  assert.equal(project.name, '未命名项目')
  const events: Array<{ type: string; title?: string }> = []
  await ds.sendMessage(project.id, {
    text: '帮这套出图，不确定用什么风格',
    mode: 'agent',
    attachments: [{ kind: 'product', id: 'p_tweed', label: '米白粗花呢套装', image: { id: 'i2', url: '/v2-mock/c10r1.jpg', width: 320, height: 823 } }],
  }, (e) => {
    if (e.type === 'message' && (e.message.role === 'ask' || e.message.role === 'assistant')) {
      events.push({ type: e.type, title: e.message.title })
    }
  })
  assert.ok(events.some(e => Boolean(e.title)))
  const afterAsk = await ds.getProject(project.id)
  assert.notEqual(afterAsk?.project.name, '未命名项目')

  await ds.renameProject(project.id, '我的定制标题')
  await ds.sendMessage(project.id, {
    text: 'Q：选风格 A：自然日光外景',
    mode: 'agent',
    attachments: [],
  }, () => {})
  const afterGen = await ds.getProject(project.id)
  assert.equal(afterGen?.project.name, '我的定制标题')
})
