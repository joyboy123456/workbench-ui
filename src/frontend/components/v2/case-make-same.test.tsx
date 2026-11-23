import './test-dom'
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { createMockDataSource } from '@/lib/v2/mock'
import { V2Provider, type V2DataSource } from '@/lib/v2/data-source'
import type { CaseExample } from '@/lib/v2/types'
import { V2AuthProvider } from './auth'
import { ToastProvider } from './ui'
import { CaseDetail } from './case-detail'
import { Composer, type ComposerSubmission } from './composer'

const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) }) }
const signedIn = () => ({ id: 'test-user', username: 'test-user', displayName: '测试账号' })

async function mount(child: React.ReactNode, overrides: Partial<V2DataSource> = {}) {
  const source: V2DataSource = { ...createMockDataSource({ pause: async () => {} }), getSession: async () => signedIn(), listActiveTasks: async () => [], ...overrides }
  const host = document.createElement('div'); host.className = 'v2'; document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/v2']}>
            <V2Provider source={source}>
              <ToastProvider>
                <V2AuthProvider>{child}</V2AuthProvider>
              </ToastProvider>
            </V2Provider>
          </MemoryRouter>,
    )
  })
  await settle()
  return { host, close: async () => { await act(async () => root.unmount()); host.remove() } }
}

test('CaseDetail 弹窗不暴露长提示词与复制提示词按钮，仅展示做同款所需素材引导', async () => {
  const sample: CaseExample = {
    id: 'yibai-case-1',
    title: '法式街拍连衣裙',
    image: { id: 'img-1', url: '/v2-mock/c1.jpg', width: 900, height: 1200 },
    category: 'model',
    aspect: 'tall',
    toolId: '80262',
    toolName: '模特换衣（智能提示词）',
    keyword: '做同款：法式街拍连衣裙',
    inputHint: ['人物底图', '服装参考图'],
    meta: { aspectRatio: '3:4', resolution: '2k' },
  }
  let clickedId = ''
  const page = await mount(
    <CaseDetail cases={[sample]} index={0} onIndexChange={() => {}} onClose={() => {}} onMakeSame={c => { clickedId = c.id }} />,
  )
  try {
    const text = page.host.textContent ?? ''
    assert.match(text, /做同款准备/)
    assert.match(text, /人物底图、服装参考图/)
    assert.doesNotMatch(text, /复制提示词|展开全部/)
    const btn = [...page.host.querySelectorAll('button')].find(el => el.textContent?.includes('做同款'))
    assert.ok(btn)
    await act(async () => btn.click())
    assert.equal(clickedId, 'yibai-case-1')
  } finally {
    await page.close()
  }
})

test('Composer 预填 caseId 后发送隐式携带 caseId，仅展示短词文本', async () => {
  const submissions: Array<{ text: string; mode: string; submission: ComposerSubmission }> = []
  const page = await mount(
    <Composer
      attachments={[]}
      onAttachmentsChange={() => {}}
      onSend={(text, mode, submission) => { submissions.push({ text, mode, submission }) }}
      prefill={{ id: 'pf-1', text: '做同款：法式街拍连衣裙', caseId: 'yibai-case-1', mode: 'agent' }}
    />,
  )
  try {
    await settle()
    const ta = page.host.querySelector('textarea')
    assert.equal(ta?.value, '做同款：法式街拍连衣裙')
    const go = page.host.querySelector<HTMLButtonElement>('.go')
    assert.ok(go && !go.disabled)
    await act(async () => go.click())
    await settle()
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].text, '做同款：法式街拍连衣裙')
    assert.equal(submissions[0].mode, 'agent')
    assert.equal(submissions[0].submission.caseId, 'yibai-case-1')
  } finally {
    await page.close()
  }
})
