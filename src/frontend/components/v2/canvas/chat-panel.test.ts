import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, type ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { renderToStaticMarkup as renderReact } from 'react-dom/server'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource, summarizeProjectTitle } from '@/lib/v2/mock'
import type { CanvasItem, ChatAttachment, ChatMessage } from '@/lib/v2/types'
import { ChatPanel, parseAskAnswer, type ChatPanelProps } from './chat-panel'
import { extractActiveReferences, findCanvasItemForReference } from '@/lib/v2/canvas-references'
import { ReferencePanel } from './reference-panel'
import { V2AuthProvider } from '../auth'
import { GEN_SMOKE_SRC, genDelay, genSmokeVariant } from './generation-state'
import { GenerationBatchStep, GenerationStateProvider } from './generation-state'

function renderToStaticMarkup(content: ReactElement) {
  return renderReact(createElement(MemoryRouter, { children: content }))
}

function renderMessage(text: string, attachments: ChatAttachment[]) {
  const props: ChatPanelProps = {
    project: { id: 'project', name: '测试项目', productIds: [], updatedAt: '2026-11-16T00:00:00.000Z' },
    messages: [{ id: 'message', role: 'user', text, attachments, createdAt: '2026-11-16T00:00:00.000Z' }],
    attachments: [], canvasImages: [], busy: false, drawerOpen: false, view: 'chat', collapsed: false,
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {},
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
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {},
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

test('chat renders running result placeholders with target aspect ratio, lifecycle label without numeric progress, and completed image button', () => {
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
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {},
  }
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
  assert.match(html, /rs-skel node gen wide phase-generating/)
  assert.match(html, /aspect-ratio:1600 \/ 900/)
  // 流体烟雾版：gen-fx 内渲染物理烟雾循环视频，按 id 错相与镜像翻转，不再有 shimmer 扫光
  assert.match(html, /<i class="gen-fx" aria-hidden="true"><video[^>]*class="gen-smoke"[^>]*src="\/placeholder\/v2-gen-smoke\.mp4"/)
  assert.match(html, /--delay:-\d+\.\d{2}s/)
  assert.doesNotMatch(html, /shimmer|gen-dots/)
  assert.doesNotMatch(html, /48%|<progress/)
  assert.match(html, /生成中/)
  assert.match(html, /aria-label="在画布中查看第 2 张生成图"/)
  assert.doesNotMatch(html, /expand-canvas-btn/)
  assert.doesNotMatch(html, /data-testid="auto-expand-switch"/)
  assert.doesNotMatch(html, /fh-cred/)
  assert.match(html, /class="rs-card"/)
  assert.match(html, /aspect-ratio:640 \/ 857/)
  assert.match(html, /640 × 857/)
})

test('reference panel extracts active round references across ask replies and shows the empty reference tab', () => {
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
  assert.deepEqual(extractActiveReferences(plainFollowUp, null, true), refs)
  assert.deepEqual(extractActiveReferences([...msgs, { ...plainFollowUp[3], role: 'user', text: '新构图', attachments: [], appliedReferences: [] }]), [])

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
  assert.match(emptyHtml, /当前消息暂无参考图/)
  assert.match(emptyHtml, /我的素材/)
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

test('ask answers render as the chosen answer with the question as a small label', () => {
  assert.deepEqual(parseAskAnswer('Q：这组图片希望采用哪种视觉基调？ A：自然日光外景'), { question: '这组图片希望采用哪种视觉基调', answer: '自然日光外景' })
  assert.equal(parseAskAnswer('普通消息'), null)
  assert.equal(parseAskAnswer('Q：问题 A：'), null)
})

test('mock title keeps garment and scene instead of cutting the prompt mid-word', () => {
  const title = summarizeProjectTitle('帮我选一个风格，给这件针织开衫出 4 张外景主图', [], 'agent')
  assert.equal(title, '针织开衫外景主图')
})


test('batch step uses real completed counts and does not label missing canvas outputs as done', () => {
  const output: CanvasItem = { id: 'one', ref: { type: 'generation', id: 'r1' }, image: { id: 'image', url: '/image.png', width: 800, height: 1000 }, x: 0, y: 0, w: 150, status: 'done' }
  const render = (items: CanvasItem[]) => renderToStaticMarkup(createElement(GenerationStateProvider, {
    items, children: createElement(GenerationBatchStep, { itemIds: ['one', 'two'], label: '商品主图 · 第 1 张' }),
  }))
  assert.match(render([output, { ...output, id: 'two', status: 'running' }]), /已完成 1\/2/)
  const missing = render([output])
  assert.match(missing, /状态待确认/)
  assert.doesNotMatch(missing, /class="sl generation-step done"/)
})

test('soft-fog phase offset spreads sibling ids that differ only in the last character', () => {
  const ids = ['ci_mwjg8abc0', 'ci_mwjg8abc1', 'ci_mwjg8abc2', 'ci_mwjg8abc3']
  const delays = ids.map(id => Number(genDelay(id).replace(/s$/, '')))
  for (const delay of delays) assert.ok(delay <= 0 && delay > -3.8)
  assert.equal(new Set(delays).size, 4)
  assert.ok(Math.max(...delays) - Math.min(...delays) >= 1, `相位过于集中：${delays.join(', ')}`)
  assert.equal(genDelay('ci_mwjg8abc0'), genDelay('ci_mwjg8abc0'))

  const variants = ids.map(id => genSmokeVariant(id))
  assert.equal(new Set(variants.map(v => v.offsetSec)).size, 4)
  assert.equal(GEN_SMOKE_SRC, '/placeholder/v2-gen-smoke.mp4')
})

test('图像模式直出跳过思考步骤与提问卡，立即产出 N 个占位框与结果卡；Agent 先给方案产出方案卡并可确认执行', async () => {
  const ds = createMockDataSource({ pause: async () => {} })
  const project = await ds.createProject({})
  const directEvents: Array<{ type: string; steps?: number }> = []
  await ds.sendMessage(project.id, {
    text: '不确定背景，直接按提示词出 3 张白底图',
    mode: 'image',
    attachments: [],
    generation: { modelId: 'nano-banana-2', ratio: '1:1', resolution: '2k', count: 3 },
  }, event => {
    if (event.type === 'message' && event.message.role === 'assistant') {
      directEvents.push({ type: event.type, steps: event.message.steps.filter(s => s.icon === 'think').length })
    }
    if (event.type === 'item-add') directEvents.push({ type: 'item-add' })
  })
  assert.equal(directEvents.filter(e => e.type === 'item-add').length, 3, '直出立即落 3 个占位框')
  assert.ok(directEvents.every(e => !e.steps), '图像模式不产出思考步骤')

  await ds.sendMessage(project.id, {
    text: '先给方案：帮真丝衬衫做 2 张柔光外景图',
    mode: 'agent',
    attachments: [],
    generation: { modelId: 'nano-banana-2', ratio: '3:4', resolution: '2k', count: 2 },
  }, () => {})
  const beforeConfirm = await ds.getProject(project.id)
  const planMsg = beforeConfirm?.messages.findLast(m => m.role === 'assistant' && Boolean(m.imagePlan))
  assert.ok(planMsg && planMsg.role === 'assistant' && planMsg.imagePlan)
  assert.equal(planMsg.imagePlan.status, 'draft')

  const html = renderToStaticMarkup(createElement(V2Provider, {
    source: ds,
    children: createElement(V2AuthProvider, {
      children: createElement(GenerationStateProvider, {
        items: [{ id: 'vid_fail', mediaType: 'video', ref: { type: 'generation', id: 'vid_fail' }, image: { id: 'vid_fail', url: '/p.png', width: 1280, height: 720 }, x: 0, y: 0, w: 150, status: 'failed', retryAllowed: true }],
        children: createElement(ChatPanel, {
          project,
          messages: [
            planMsg,
            { id: 'v_msg', role: 'assistant', createdAt: '2026-11-18T00:00:00.000Z', steps: [], results: [{ id: 'vid_fail', itemId: 'vid_fail', status: 'failed' }] },
          ],
          attachments: [],
          canvasImages: [],
          busy: false,
          outputting: true,
          onStop: async () => {},
          onRetryVideo: async () => {},
          onReviewPlan: async () => {},
          drawerOpen: false,
          view: 'split',
          collapsed: false,
          onAttachmentsChange() {},
          onSend() {},
          onToggleDrawer() {},
          onRename() {},
          onNewProject() {},
          onFocusResult() {},
          onCollapseChange() {},
          onViewChange() {},
        }),
      }),
    }),
  }))
  assert.match(html, /确认执行/, '方案卡展示确认执行按钮')
  assert.match(html, /修改方案/, '方案卡展示修改入口')
  assert.match(html, /重试视频/, '视频失败卡支持单独重试')
  assert.match(html, /aria-label="发送"/, '生成中输入框保留发送按钮而不被停止键替换')
})

test('Lovart 对话排版：保留语义步骤图标、默认展开思考摘要、精简用户气泡引用与 Q/A 问答回显', () => {
  const props: ChatPanelProps = {
    project: { id: 'project', name: '测试项目', productIds: [], updatedAt: '2026-11-19T00:00:00.000Z' },
    messages: [
      {
        id: 'u_ref',
        role: 'user',
        createdAt: '2026-11-19T00:00:00.000Z',
        text: '用商品图做四帧循环 GIF 动图',
        attachments: [
          { kind: 'upload', id: 'att1', label: 'ref-sweatshirt.webp', image: { id: 'img_ref', url: '/v2-mock/c1.jpg', width: 1536, height: 2048 } },
        ],
      },
      {
        id: 'a_think',
        role: 'assistant',
        createdAt: '2026-11-19T00:00:01.000Z',
        steps: [
          { label: '技能文件读取完成', icon: 'doc', status: 'done', collapsible: true, detail: '已加载技能：gif-animation' },
          { label: '思考完成', icon: 'think', status: 'done', collapsible: true, detail: '我先读取你选中的技能规范，同时分析参考图。' },
          { label: '已分析参考图', icon: 'image', status: 'done', collapsible: true, detail: '商品锁定：黑色连帽卫衣' },
        ],
        results: [],
        body: '在开工前有三个点需要你定一下：',
      },
      {
        id: 'u_qa',
        role: 'user',
        createdAt: '2026-11-19T00:00:02.000Z',
        text: 'Q：这组图的主题方向是哪个？ A：OOTD 穿搭分享\nQ：一共要几张？ A：2张',
        attachments: [],
      },
    ],
    attachments: [], canvasImages: [], busy: false, drawerOpen: false, view: 'chat', collapsed: false,
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onCollapseChange() {}, onViewChange() {},
  }
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
  // 用户气泡附件使用紧凑 chip，不在气泡内堆叠原始宽高文本
  assert.match(html, /ref-sweatshirt\.webp/)
  assert.doesNotMatch(html, /<small>1536 × 2048<\/small>/)
  // 步骤保留语义图标（doc / hist / img），思考完成默认展开导轨摘要，参考分析默认收起
  assert.match(html, /class="ab-steps"/)
  assert.match(html, /data-icon="doc"/)
  assert.match(html, /data-icon="hist"/)
  assert.match(html, /我先读取你选中的技能规范，同时分析参考图。/)
  assert.doesNotMatch(html, /商品锁定：黑色连帽卫衣/)
  // 问答回显采用 Q: / A: 双行结构，不再带冗余「问题回答」标题
  assert.doesNotMatch(html, /问题回答/)
  assert.match(html, /<b>Q:<\/b> 这组图的主题方向是哪个？？?/)
  assert.match(html, /<b>A:<\/b> OOTD 穿搭分享/)
})

test('reference analysis step renders clickable chevron link when onOpenReferences is provided', () => {
  const props: ChatPanelProps = {
    project: { id: 'p_ref', name: '参考联动', updatedAt: '2026-11-20T00:00:00.000Z', productIds: [] },
    messages: [{
      id: 'a_ref',
      role: 'assistant',
      createdAt: '2026-11-20T00:00:01.000Z',
      steps: [
        { label: '思考完成', icon: 'think', status: 'done' },
        { label: '参考素材分析结束', icon: 'image', status: 'done' },
      ],
      results: [],
    }],
    attachments: [], canvasImages: [], busy: false, drawerOpen: false, view: 'chat', collapsed: false,
    onAttachmentsChange() {}, onSend() {}, onToggleDrawer() {}, onRename() {}, onNewProject() {},
    onFocusResult() {}, onOpenReferences() {}, onCollapseChange() {}, onViewChange() {},
  }
  const html = renderToStaticMarkup(createElement(V2Provider, { source: createMockDataSource(), children: createElement(V2AuthProvider, { children: createElement(ChatPanel, props) }) }))
  assert.match(html, /class="sl done collapsible ref-link"/)
  assert.match(html, /title="查看参考素材面板"/)
  assert.match(html, /data-icon="chevR"/)
})
