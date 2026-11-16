'use client'
import { useState } from 'react'
import { normalizeGeneration, type ComposerGeneration, type ComposerOptions } from '@/lib/v2/composer-options'
import type { AgentMode } from '@/lib/v2/types'
import { Icon } from './icons'

export const MODES: { id: AgentMode; name: string; hint: string; icon: string }[] = [
  { id: 'agent', name: 'Agent', hint: '自动选工具和参数', icon: 'star' },
  { id: 'ecom-set', name: '电商套图', hint: '主图 + 详情页一次出', icon: 'doc' },
  { id: 'direct', name: '直接生图', hint: '按提示词直接生成', icon: 'img' },
]
export type ParameterPanel = 'mode' | 'model' | 'format' | 'count'
export function ComposerParameters({ panel, options, generation, mode, onGenerationChange, onModeChange, onClose }: {
  panel: ParameterPanel
  options?: ComposerOptions
  generation: ComposerGeneration
  mode: AgentMode
  onGenerationChange: (value: ComposerGeneration) => void
  onModeChange: (value: AgentMode) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'recommended' | 'all'>('recommended')
  const set = (patch: Partial<ComposerGeneration>) => onGenerationChange(options ? normalizeGeneration({ ...generation, ...patch }, options) : { ...generation, ...patch })
  if (panel === 'mode') return <><div className="cp-pop-h"><b>创作模式</b></div>{MODES.map(item => <button type="button" key={item.id} data-cp-option className={'cp-option' + (mode === item.id ? ' selected' : '')} aria-pressed={mode === item.id} onClick={() => { onModeChange(item.id); onClose() }}><Icon name={item.icon} size={18} /><span>{item.name}<small>{item.hint}</small></span>{mode === item.id && <Icon name="check" size={13} />}</button>)}</>
  if (panel === 'count') return <><div className="cp-pop-h"><b>生成张数</b><small>每次 1–8 张</small></div><div className="cp-count-grid">{Array.from({ length: 8 }, (_, index) => index + 1).map(count => <button type="button" key={count} data-cp-option className={generation.count === count ? 'on' : ''} disabled={mode === 'direct' && count > (options?.directMaxCount ?? 1)} aria-label={`${count} 张`} aria-pressed={generation.count === count} onClick={() => { set({ count }); onClose() }}>{count}</button>)}</div>{mode === 'direct' && options?.directMaxCount === 1 && <p className="cp-empty">直接生图每次 1 张；多张请切换 Agent。</p>}<p className="cp-empty">Agent 会结合本次需求规划输出。</p></>
  if (panel === 'model') {
    const models = (options?.models ?? []).filter(item => (!query ? tab === 'all' || item.recommended : `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())))
    return <><div className="cp-pop-h"><b>选择模型</b></div><div className="cp-search"><Icon name="search" size={14} /><input aria-label="搜索模型" placeholder="搜索模型名称或能力" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="cp-segments" aria-label="模型筛选"><button type="button" aria-pressed={tab === 'recommended'} className={tab === 'recommended' ? 'on' : ''} onClick={() => setTab('recommended')}>推荐</button><button type="button" aria-pressed={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部</button></div><div className="cp-options">{models.map(item => <button type="button" data-cp-option className={'cp-option' + (generation.modelId === item.id ? ' selected' : '')} key={item.id} aria-pressed={generation.modelId === item.id} onClick={() => { set({ modelId: item.id }); onClose() }}><Icon name="sparkles" size={17} /><span>{item.name}<small>{item.description}</small></span>{generation.modelId === item.id && <Icon name="check" size={13} />}</button>)}{!models.length && <p className="cp-empty">{options?.models.length ? '没有匹配的模型，可查看全部' : '暂无可用模型'}</p>}</div></>
  }
  const model = options?.models.find(item => item.id === generation.modelId)
  const resolutions = model?.resolutions ?? options?.resolutions ?? []
  return <><div className="cp-pop-h"><b>画面规格</b></div><div className="cp-group">比例</div><div className="cp-ratio-grid">{(options?.ratios ?? []).map(ratio => <button type="button" data-cp-option key={ratio} className={generation.ratio === ratio ? 'on' : ''} aria-pressed={generation.ratio === ratio} onClick={() => set({ ratio })}><Icon name="ratio" size={17} />{ratio}</button>)}</div>{!options?.ratios.length && <p className="cp-empty">正在加载可选比例</p>}<div className="cp-group">分辨率</div><div className="cp-segments">{resolutions.map(resolution => <button type="button" data-cp-option key={resolution} className={generation.resolution === resolution ? 'on' : ''} aria-pressed={generation.resolution === resolution} onClick={() => set({ resolution })}>{resolution.toUpperCase()}</button>)}</div><p className="cp-empty">分辨率随当前模型能力调整。</p><button type="button" className="cp-confirm" onClick={onClose}>完成</button></>
}
