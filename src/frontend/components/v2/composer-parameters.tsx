'use client'
import React, { useState } from 'react'
import { resolveImageSize } from '@/lib/image-size-policy'
import { normalizeGeneration, type ComposerGeneration, type ComposerOptions } from '@/lib/v2/composer-options'
import {
  normalizeVideoGeneration,
  SELECTABLE_VIDEO_MODELS,
  VIDEO_RATIOS,
  videoChoices,
  videoModelSpec,
  type VideoGeneration,
  type VideoImageMode,
} from '@/lib/v2/video-options'
import type { AgentMode } from '@/lib/v2/types'
import { Icon, modelIconName } from './icons'
import { useToast } from './ui'

export const MODES: { id: AgentMode; name: string; hint: string; icon: string }[] = [
  { id: 'agent', name: 'Agent', hint: '理解需求并规划生成', icon: 'agent' },
  { id: 'image', name: '图像', hint: '按提示词直接生成图像', icon: 'img' },
  { id: 'video', name: '视频', hint: '多模型视频直出，支持文生与首帧图生', icon: 'video' },
]

export type ParameterPanel =
  | 'mode'
  | 'agent-ratio'
  | 'agent-count'
  | 'model'
  | 'image-spec'
  | 'video-model'
  | 'video-ratio'
  | 'video-resolution'
  | 'video-duration'
  | 'settings'
  | 'prefs'

export const AGENT_MODEL_AUTO_KEY = 'v2:agent-model-auto:v1'
export const AGENT_SPEC_AUTO_KEY = 'v2:agent-spec-auto:v1'

export function ComposerParameters({
  panel,
  options,
  generation,
  mode,
  onGenerationChange,
  onModeChange,
  onPanelChange,
  onClose,
  agentAuto = true,
  videoChoiceMode,
  onAgentAutoChange,
  agentRatioAuto = true,
  onAgentRatioAutoChange,
  agentCountAuto = true,
  onAgentCountAutoChange,
  video,
  onVideoChange,
}: {
  panel: ParameterPanel
  /** Agent 模式「模型偏好」：自动 = 由 Agent 决定（目前后端用默认模型） */
  agentAuto?: boolean
  onAgentAutoChange?: (value: boolean) => void
  agentRatioAuto?: boolean
  onAgentRatioAutoChange?: (value: boolean) => void
  agentCountAuto?: boolean
  onAgentCountAutoChange?: (value: boolean) => void
  options?: ComposerOptions
  generation: ComposerGeneration
  mode: AgentMode
  onGenerationChange: (value: ComposerGeneration) => void
  onModeChange: (value: AgentMode) => void
  onPanelChange: (value: ParameterPanel) => void
  onClose: () => void
  video?: VideoGeneration
  onVideoChange?: (value: VideoGeneration) => void
  /** 实际提交时的图片模式，用来收窄可选清晰度/时长。 */
  videoChoiceMode?: VideoImageMode
}) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'recommended' | 'all'>('recommended')
  const [prefsTab, setPrefsTab] = useState<'image' | 'video'>('image')

  const set = (patch: Partial<ComposerGeneration>) => {
    const next = options ? normalizeGeneration({ ...generation, ...patch }, options) : { ...generation, ...patch }
    if (patch.modelId && patch.modelId !== generation.modelId && options) {
      const targetModel = options.models.find(m => m.id === patch.modelId)
      const adjusted: string[] = []
      if (next.ratio !== generation.ratio) adjusted.push(`比例 ${next.ratio}`)
      if (next.resolution !== generation.resolution) adjusted.push(`分辨率 ${next.resolution.toUpperCase()}`)
      if (adjusted.length && targetModel) {
        toast(`已切换为 ${targetModel.name}，已自动调整为 ${adjusted.join('、')}`)
      }
    }
    onGenerationChange(next)
  }

  // 对齐 Lovart 画布左下角模式弹层：无多余标题，圆角浮层，图标 + 名称 + 一句话说明 + 右侧选中勾
  if (panel === 'mode') {
    return (
      <div className="cp-mode-list" role="menu" aria-label="切换模式">
        {MODES.map(item => (
          <button
            type="button"
            key={item.id}
            data-cp-option
            className={'cp-option cp-mode-option' + (mode === item.id ? ' selected' : '')}
            aria-pressed={mode === item.id}
            onClick={() => { onModeChange(item.id); onClose() }}
          >
            <Icon name={item.icon} size={18} />
            <span><b>{item.name}</b><small>{item.hint}</small></span>
            {mode === item.id && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
    )
  }

  if (panel === 'prefs') {
    const models = options?.models ?? []
    return (
      <div className="cp-prefs">
        <div className="cp-prefs-h">
          <b>模型偏好</b>
          <label className="cp-prefs-auto">
            <span>自动</span>
            <button type="button" role="switch" aria-checked={agentAuto} aria-label="自动选择模型" className={'cp-switch' + (agentAuto ? ' on' : '')} onClick={() => onAgentAutoChange?.(!agentAuto)}><i /></button>
          </label>
        </div>
        <div className="cp-prefs-seg" role="tablist" aria-label="模型类型">
          <button type="button" role="tab" aria-selected={prefsTab === 'image'} className={prefsTab === 'image' ? 'on' : ''} onClick={() => setPrefsTab('image')}>图片</button>
          <button type="button" role="tab" aria-selected={prefsTab === 'video'} className={prefsTab === 'video' ? 'on' : ''} onClick={() => setPrefsTab('video')}>视频</button>
        </div>
        <div className="cp-prefs-list">
          {prefsTab === 'video' ? <>
            <div className="cp-prefs-g">视频</div>
            {SELECTABLE_VIDEO_MODELS.map(item => {
              const on = video?.modelId === item.id
              return (
                <button
                  type="button"
                  key={item.id}
                  data-cp-option
                  className={'cp-prefs-row' + (on ? ' on' : '')}
                  aria-pressed={on}
                  onClick={() => {
                    if (video && onVideoChange) {
                      onVideoChange(normalizeVideoGeneration({ ...video, modelId: item.id }))
                    }
                  }}
                >
                  <Icon name={modelIconName(item.id)} size={18} />
                  <span className="cp-prefs-tx"><b>{item.name}{item.recommended && <em>推荐</em>}</b><small>{item.description}</small></span>
                  <span className={'cp-prefs-ck' + (on ? ' on' : '')} aria-hidden>{on && <Icon name="check" size={11} />}</span>
                </button>
              )
            })}
          </> : <>
            <div className="cp-prefs-g">图片</div>
            {models.map(item => {
              const on = !agentAuto && generation.modelId === item.id
              return (
                <button
                  type="button"
                  key={item.id}
                  data-cp-option
                  className={'cp-prefs-row' + (on ? ' on' : '')}
                  aria-pressed={on}
                  onClick={() => { set({ modelId: item.id }); onAgentAutoChange?.(false) }}
                >
                  <Icon name={modelIconName(item.id)} size={18} />
                  <span className="cp-prefs-tx"><b>{item.name}{item.recommended && <em>推荐</em>}</b><small>{item.description}</small></span>
                  <span className={'cp-prefs-ck' + (on ? ' on' : '')} aria-hidden>{on && <Icon name="check" size={11} />}</span>
                </button>
              )
            })}
            {!models.length && <p className="cp-empty">暂无可用模型</p>}
          </>}
        </div>
      </div>
    )
  }

  const model = options?.models.find(item => item.id === generation.modelId)
  const supportedRatios = model?.ratios ?? options?.ratios ?? []
  const supportedResolutions = model?.resolutions ?? options?.resolutions ?? []
  const allResolutions = options?.resolutions ?? supportedResolutions

  if (panel === 'agent-ratio') {
    return (
      <div className="cp-flat-pop">
        <button
          type="button"
          data-cp-option
          className={'cp-option' + (agentRatioAuto ? ' selected' : '')}
          aria-label="自动"
          aria-pressed={agentRatioAuto}
          onClick={() => { onAgentRatioAutoChange?.(true); onClose() }}
        >
          <Icon name="sparkles" size={15} />
          <span><b>自动</b><small>按需求与参考图决定比例</small></span>
          {agentRatioAuto && <Icon name="check" size={13} />}
        </button>
        <div className="cp-ratio-grid">
          {(options?.ratios ?? ['1:1', '3:4', '4:3', '9:16', '16:9']).map(ratio => {
            const active = !agentRatioAuto && generation.ratio === ratio
            const [w, h] = ratio.split(':').map(Number)
            const scale = 18 / Math.max(w, h)
            return (
              <button
                type="button"
                data-cp-option
                key={ratio}
                className={active ? 'on' : ''}
                aria-label={ratio}
                aria-pressed={active}
                onClick={() => {
                  onAgentRatioAutoChange?.(false)
                  set({ ratio })
                  onClose()
                }}
              >
                <span className="cp-ratio-shape" aria-hidden="true" style={{ width: w * scale, height: h * scale }} />
                {ratio}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'agent-count') {
    const maxCount = Math.min(options?.directMaxCount ?? 4, 4)
    return (
      <div className="cp-flat-pop">
        <button
          type="button"
          data-cp-option
          className={'cp-option' + (agentCountAuto ? ' selected' : '')}
          aria-label="自动"
          aria-pressed={agentCountAuto}
          onClick={() => { onAgentCountAutoChange?.(true); onClose() }}
        >
          <Icon name="sparkles" size={15} />
          <span><b>自动</b><small>按需求自动决定出图张数</small></span>
          {agentCountAuto && <Icon name="check" size={13} />}
        </button>
        <div className="cp-count-list" aria-label="生成张数">
          {Array.from({ length: maxCount }, (_, index) => index + 1).map(count => {
            const active = !agentCountAuto && generation.count === count
            return (
              <button
                type="button"
                key={count}
                data-cp-option
                className={'cp-option' + (active ? ' selected' : '')}
                aria-label={`${count} 张`}
                aria-pressed={active}
                onClick={() => {
                  onAgentCountAutoChange?.(false)
                  set({ count })
                  onClose()
                }}
              >
                <span>{count} 张</span>
                {active && <Icon name="check" size={13} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'video-model' && video && onVideoChange) {
    const videoModels = SELECTABLE_VIDEO_MODELS.filter(item => (
      !query
        ? tab === 'all' || item.recommended
        : `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())
    ))
    return (
      <>
        <div className="cp-pop-h"><b>选择视频模型</b></div>
        <div className="cp-search">
          <Icon name="search" size={14} />
          <input aria-label="搜索视频模型" placeholder="搜索视频模型" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <div className="cp-segments" aria-label="视频模型筛选">
          <button type="button" aria-pressed={tab === 'recommended'} className={tab === 'recommended' ? 'on' : ''} onClick={() => setTab('recommended')}>推荐</button>
          <button type="button" aria-pressed={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部</button>
        </div>
        <div className="cp-options">
          {videoModels.map(item => {
            const active = video.modelId === item.id
            return (
              <button
                type="button"
                data-cp-option
                key={item.id}
                className={'cp-option' + (active ? ' selected' : '')}
                aria-pressed={active}
                onClick={() => {
                  const next = normalizeVideoGeneration({ ...video, modelId: item.id })
                  const adjusted: string[] = []
                  if (next.resolution !== video.resolution) adjusted.push(`清晰度 ${next.resolution.toUpperCase()}`)
                  if (next.duration !== video.duration) adjusted.push(`时长 ${next.duration}s`)
                  if (next.ratio !== video.ratio) adjusted.push(`比例 ${next.ratio}`)
                  if (adjusted.length) toast(`已切换为 ${item.name}，自动匹配 ${adjusted.join('、')}`)
                  onVideoChange(next)
                  onClose()
                }}
              >
                <Icon name={modelIconName(item.id)} size={17} />
                <span>
                  <b className="cp-model-title">
                    {item.name}
                    {item.supportsAudio && <em className="cp-speed-tag cp-speed-fine">有声</em>}
                  </b>
                  <small>{item.description}</small>
                </span>
                {active && <Icon name="check" size={14} />}
              </button>
            )
          })}
          {!videoModels.length && <p className="cp-empty">无匹配视频模型</p>}
        </div>
      </>
    )
  }

  if (panel === 'video-ratio' && video && onVideoChange) {
    const spec = videoModelSpec(video.modelId)
    const autoLabel = video.imageMode === 'reference' ? '自动（16:9）' : '跟随首帧'
    const ratios = ['auto', ...(spec?.ratios ?? VIDEO_RATIOS)] as const
    return (
      <div className="cp-flat-pop">
        <div className="cp-ratio-grid">
          {ratios.map(ratio => {
            const auto = ratio === 'auto'
            const [w, h] = auto ? [0, 0] : ratio.split(':').map(Number)
            const scale = 18 / Math.max(w, h)
            const active = video.ratio === ratio
            return (
              <button
                type="button"
                data-cp-option
                key={ratio}
                className={active ? 'on' : ''}
                aria-label={auto ? autoLabel : ratio}
                aria-pressed={active}
                onClick={() => { onVideoChange({ ...video, ratio }); onClose() }}
              >
                {!auto && <span className="cp-ratio-shape" aria-hidden="true" style={{ width: w * scale, height: h * scale }} />}
                {auto ? autoLabel : ratio}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'video-resolution' && video && onVideoChange) {
    const { resolutions } = videoChoices({ modelId: video.modelId, imageMode: videoChoiceMode ?? video.imageMode })
    return (
      <div className="cp-flat-pop">
        <div className="cp-count-list" aria-label="视频清晰度">
          {resolutions.map(resolution => {
            const active = video.resolution === resolution
            return (
              <button
                type="button"
                key={resolution}
                data-cp-option
                className={'cp-option' + (active ? ' selected' : '')}
                aria-label={resolution.toUpperCase()}
                aria-pressed={active}
                onClick={() => { onVideoChange({ ...video, resolution }); onClose() }}
              >
                <span>{resolution.toUpperCase()}</span>
                {active && <Icon name="check" size={13} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'video-duration' && video && onVideoChange) {
    const { durations } = videoChoices({ modelId: video.modelId, imageMode: videoChoiceMode ?? video.imageMode })
    return (
      <div className="cp-flat-pop">
        <div className="cp-count-list" aria-label="视频时长">
          {durations.map(duration => {
            const active = video.duration === duration
            return (
              <button
                type="button"
                key={duration}
                data-cp-option
                className={'cp-option' + (active ? ' selected' : '')}
                aria-label={`${duration} 秒`}
                aria-pressed={active}
                onClick={() => { onVideoChange({ ...video, duration }); onClose() }}
              >
                <span>{duration} 秒</span>
                {active && <Icon name="check" size={13} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (panel === 'model') {
    const models = (options?.models ?? []).filter(item => (
      !query
        ? tab === 'all' || item.recommended
        : `${item.name} ${item.description} ${item.speedTag} ${(item.strengthTags ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    ))
    return (
      <>
        <div className="cp-pop-h"><b>选择模型</b></div>
        <div className="cp-search">
          <Icon name="search" size={14} />
          <input aria-label="搜索模型" placeholder="搜索模型名称或能力" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
        <div className="cp-segments" aria-label="模型筛选">
          <button type="button" aria-pressed={tab === 'recommended'} className={tab === 'recommended' ? 'on' : ''} onClick={() => setTab('recommended')}>推荐</button>
          <button type="button" aria-pressed={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部</button>
        </div>
        <div className="cp-options">
          {models.map(item => (
            <button
              type="button"
              data-cp-option
              className={'cp-option' + (generation.modelId === item.id ? ' selected' : '')}
              key={item.id}
              aria-pressed={generation.modelId === item.id}
              onClick={() => { set({ modelId: item.id }); onClose() }}
            >
              <Icon name={modelIconName(item.id)} size={17} />
              <span>
                <span className="cp-model-row">
                  <b>{item.name}</b>
                  <span className="cp-model-tags">
                    {item.speedTag && <em className={`cp-tag speed-${item.speedTag === '快' ? 'fast' : item.speedTag === '精细' ? 'fine' : 'std'}`}>{item.speedTag}</em>}
                    {(item.strengthTags ?? []).map(tag => (
                      <em key={tag} className="cp-tag">{tag}</em>
                    ))}
                  </span>
                </span>
                <small>{item.description}</small>
              </span>
              {generation.modelId === item.id && <Icon name="check" size={13} />}
            </button>
          ))}
          {!models.length && <p className="cp-empty">{options?.models.length ? '没有匹配的模型，可查看全部' : '暂无可用模型'}</p>}
        </div>
      </>
    )
  }

  const maxCount = mode === 'image' ? Math.min(options?.directMaxCount ?? 4, 4) : 8
  const { width, height } = resolveImageSize(generation.ratio, generation.resolution)
  return (
    <>
      <div className="cp-pop-h"><b>{panel === 'image-spec' ? '图像规格' : '生成设置'}</b></div>
      {panel === 'settings' && <button type="button" data-cp-option className="cp-option" onClick={() => onPanelChange('model')}>
        <Icon name={modelIconName(generation.modelId)} size={16} /><span>模型<small>{model?.name ?? '选择模型'}</small></span><Icon name="right" size={13} />
      </button>}
      <div className="cp-group">清晰度</div>
      <div className="cp-segments">
        {allResolutions.map(resolution => {
          const unsupported = Boolean(model && !supportedResolutions.includes(resolution))
          const tip = unsupported ? `当前模型「${model?.name}」不支持 ${resolution.toUpperCase()} 分辨率` : undefined
          return (
            <button
              type="button"
              data-cp-option
              key={resolution}
              className={generation.resolution === resolution ? 'on' : ''}
              disabled={unsupported}
              title={tip}
              aria-label={tip ?? resolution.toUpperCase()}
              aria-pressed={generation.resolution === resolution}
              onClick={() => set({ resolution })}
            >
              {resolution.toUpperCase()}
            </button>
          )
        })}
      </div>
      <div className="cp-group">尺寸 <small>参考像素</small></div>
      <div className="cp-size-preview" aria-label="参考尺寸">
        <span><abbr title="宽度">W</abbr> {width}</span>
        <span className="cp-size-times" aria-hidden="true">×</span>
        <span><abbr title="高度">H</abbr> {height}</span>
      </div>
      <div className="cp-group">宽高比</div>
      <div className="cp-ratio-grid">
        {(options?.ratios ?? []).map(ratio => {
          const unsupported = Boolean(model && !supportedRatios.includes(ratio))
          const tip = unsupported ? `当前模型「${model?.name}」不支持 ${ratio} 比例` : undefined
          const [w, h] = ratio.split(':').map(Number)
          const scale = 20 / Math.max(w, h)
          return (
            <button
              type="button"
              data-cp-option
              key={ratio}
              className={generation.ratio === ratio ? 'on' : ''}
              disabled={unsupported}
              title={tip}
              aria-label={tip ?? ratio}
              aria-pressed={generation.ratio === ratio}
              onClick={() => set({ ratio })}
            >
              <span className="cp-ratio-shape" aria-hidden="true" style={{ width: w * scale, height: h * scale }} />
              {ratio}
            </button>
          )
        })}
      </div>
      {!options?.ratios.length && <p className="cp-empty">正在加载可选比例</p>}
      <div className="cp-group">张数<small>1–{maxCount} 张</small></div>
      <div className="cp-count-grid" aria-label="生成张数">
        {Array.from({ length: maxCount }, (_, index) => index + 1).map(count => (
          <button
            type="button"
            key={count}
            data-cp-option
            className={generation.count === count ? 'on' : ''}
            aria-label={`${count} 张`}
            aria-pressed={generation.count === count}
            onClick={() => set({ count })}
          >
            {count}
          </button>
        ))}
      </div>
      <button type="button" className="cp-confirm" onClick={onClose}>完成</button>
    </>
  )
}
