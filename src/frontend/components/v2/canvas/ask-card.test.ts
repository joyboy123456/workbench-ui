import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AskCard, askQuestions, formatAskAnswers } from './ask-card'
import { chatMessageSchema } from '@/lib/v2/project-schema'
import { parseAskAnswers } from './chat-panel'
import type { AskMessage } from '@/lib/v2/types'

const base: AskMessage = { id: 'a1', role: 'ask', question: '选风格', options: [{ key: 'A', label: '外景' }, { key: 'B', label: '棚拍' }], createdAt: 'x' }
const multi: AskMessage = { ...base, questions: [
  { question: '场景？', mode: 'single', options: [{ key: 'A', label: '外景' }, { key: 'B', label: '棚拍' }] },
  { question: '画面？', mode: 'multiple', options: [{ key: 'A', label: '全身' }, { key: 'B', label: '半身' }], otherPlaceholder: '其它画面' },
] }

test('old single ask becomes one question with an other row', () => {
  const qs = askQuestions(base)
  assert.equal(qs.length, 1)
  assert.equal(qs[0].options.length, 2)
})

test('answers format one Q/A line per answered question, other text included, multi joined', () => {
  const r = formatAskAnswers(multi.questions!, { 0: new Set([1]), 1: new Set([0, 2]) }, { 1: ' 面料特写 ' })
  assert.equal(r.text, 'Q：场景？ A：棚拍\nQ：画面？ A：全身、面料特写')
  assert.equal(r.keys, 'B,A,C')
  assert.equal(formatAskAnswers(multi.questions!, {}, {}).text, '')
  assert.equal(formatAskAnswers(multi.questions!, { 1: new Set([2]) }, { 1: '  ' }).text, '')
})

test('multi answers parse back into rows', () => {
  assert.deepEqual(parseAskAnswers('Q：场景？ A：棚拍\nQ：画面？ A：全身、面料特写'), [{ question: '场景', answer: '棚拍' }, { question: '画面', answer: '全身、面料特写' }])
  assert.deepEqual(parseAskAnswers('普通消息'), [])
})

test('card shows title, pager, letters and next/submit', () => {
  const html = renderToStaticMarkup(React.createElement(AskCard, { ask: multi, onSubmit: () => {}, onSkip: () => {} }))
  assert.match(html, /提问/)
  assert.match(html, /<span>1<\/span><span>\/<\/span><span>2<\/span>/)
  assert.match(html, /（多选）/)
  assert.match(html, /其它画面\.\.\./)
  assert.match(html, /下一个/)
  const one = renderToStaticMarkup(React.createElement(AskCard, { ask: base, onSubmit: () => {}, onSkip: () => {} }))
  assert.doesNotMatch(one, /ask-pager/)
  assert.match(one, /提交/)
})

test('画布快照保留 Lovart 多题与结构化澄清，各自恢复原卡片', () => {
  const ask = { ...multi, createdAt: '2026-11-18T00:00:00.000Z' }
  assert.deepEqual(chatMessageSchema.parse(ask), ask)
  const structured: AskMessage = { ...ask, clarification: { runId: 'run1', revision: 2, state: 'pending',
    runtimeSupported: true, referenceNodeIds: [], questions: [{ questionId: 'q1',
      spec: { field: 'scene', question: '补充场景', selection: 'text', options: [], allowCustom: true } }] } }
  const restored = chatMessageSchema.parse(structured)
  assert.ok(restored.role === 'ask')
  const html = renderToStaticMarkup(React.createElement(AskCard, { ask: restored, onSubmit: () => {}, onSkip: () => {} }))
  assert.match(html, /<form[^>]*aria-label="提问"/)
  assert.match(html, /<input[^>]*aria-label="填写答案"/)
  assert.match(html, /补充场景/)
  assert.doesNotMatch(html, /其它画面/)
})
