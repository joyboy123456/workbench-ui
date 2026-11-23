import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CanvasItem } from '@/lib/v2/types'
import { Lightbox, type LightboxProps } from './lightbox'

const source: CanvasItem = { id: 'source', ref: { type: 'material', id: 'asset' }, image: { id: 'src', url: '/source.png', width: 800, height: 1000 }, x: 0, y: 0, w: 150 }
const result: CanvasItem = { ...source, id: 'result', parentIds: ['source'], ref: { type: 'generation', id: 'generation' }, image: { ...source.image, id: 'img-result', url: '/result.png' }, status: 'done' }
const render = (extra: Partial<LightboxProps> = {}) => renderToStaticMarkup(createElement(Lightbox, {
  items: [{ id: result.id, image: result.image }], index: 0, onIndexChange() {}, onClose() {}, ...extra,
}))

test('one Lightbox keeps B layout and native modal semantics without inventing missing metadata', () => {
  const html = render()
  assert.match(html, /<dialog[^>]+class="lb-bg"/)
  assert.match(html, /class="lb-shell"/)
  assert.match(html, /未记录/)
  assert.doesNotMatch(html, /Nano Banana|刚刚|aria-modal/)
  assert.match(html, /关闭预览/)
  assert.match(html, /对比/)
})

test('Lightbox source comparison retains slider, source image and original result within the shared shell', () => {
  const html = render({ comparison: { items: [source, result], initial: true, onNavigate() {} } })
  assert.match(html, /来源与结果/)
  assert.match(html, /type="range"/)
  assert.match(html, /\/source.png/)
  assert.match(html, /\/result.png/)
  assert.match(html, /同源结果/)
  assert.equal((html.match(/<dialog/g) ?? []).length, 1)
})

test('Lightbox two-image mode retains selection order and deleted source remains explicitly missing', () => {
  const direct = render({ comparison: { items: [source, result], selection: ['result', 'source'], initial: true, onNavigate() {} } })
  assert.match(direct, /cv-compare-side/)
  assert.match(direct, /已选 2 张/)
  assert.ok(direct.indexOf('src="/result.png"') < direct.indexOf('src="/source.png"'))
  const missing = render({ comparison: { items: [result], initial: true, onNavigate() {} } })
  assert.match(missing, /来源图片已从画布删除/)
  assert.doesNotMatch(missing, /src="\/source.png"/)
})

test('Lightbox loading and denied history show explicit states instead of stale preview actions', () => {
  assert.match(render({ loading: true }), /正在读取作品详情/)
  const denied = render({ error: '记录已不可用', onRetry() {} })
  assert.match(denied, /role="alert"/)
  assert.match(denied, /重新读取/)
  assert.doesNotMatch(denied, /src="\/result.png"/)
})

test('Lightbox displays source dimensions/common ratio and recorded model/count', () => {
  const html = render({ items: [{ id: 'native', image: { id: 'native', url: '/native.png', width: 1100, height: 1467 },
    ratio: '1100:1467', modelName: '实际模型', outputCount: 2 }] })
  assert.match(html, /1100 × 1467/)
  assert.match(html, />3:4</)
  assert.doesNotMatch(html, /1100:1467/)
  assert.match(html, /实际模型/)
  assert.match(html, /2 张/)
})

test('single result toolbar comparison opens source-versus-result slider', () => {
  const html = render({ comparison: { items: [source, result], selection: [result.id], initial: true, onNavigate() {} } })
  assert.match(html, /来源与结果/)
  assert.match(html, /type="range"/)
  assert.match(html, /src="\/source.png"/)
  assert.match(html, /src="\/result.png"/)
  assert.doesNotMatch(html, /已选 2 张/)
})
