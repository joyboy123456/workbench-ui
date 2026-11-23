'use client'

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@/lib/navigation'
import {
  TOOL_FORM_RATIOS,
  buildToolFormSlots,
  catalogToolIsVideoReplica,
  catalogToolReturnsText,
  catalogToolUsesAgent,
  getToolFormConfig,
  type ToolExtraField,
  type ToolFormSlot,
} from '@/lib/v2/tool-launch-form'
import { useV2, type AgentEvent } from '@/lib/v2/data-source'
import { PENDING_KEY } from '@/lib/v2/pending-message'
import type { CanvasItem, CaseExample, CasePage, ChatAttachment, ImageRef, ToolCatalogItem, ToolParams } from '@/lib/v2/types'
import { VIDEO_MODEL } from '@/lib/v2/video-options'
import { useV2Auth } from './auth'
import { Icon } from './icons'
import { ProcessingFeedback } from './processing-feedback'
import { generationDisplay, toolDurationMs } from '@/lib/v2/generation-progress'
import { Lightbox } from './lazy-overlays'
import { useToast } from './ui'

type SlotValue =
  | { url: string; name: string; file: File; mediaKind?: 'image' | 'video' }
  | { url: string; name: string; reference: ImageRef; mediaKind?: 'image' }

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024
const VIDEO_MAX_BYTES = 80 * 1024 * 1024

function initialExtras(fields: ToolExtraField[]) {
  return Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? '']))
}

function templateReference(example: CaseExample, slot: ToolFormSlot): ImageRef {
  const refs = example.references ?? []
  const matched = refs.find(ref => ref.label && (slot.label.includes(ref.label) || ref.label.includes(slot.label)))
  // 参考图是案例任务的输入，浏览时不展示；用户点的是卡片上的案例图，模板就用案例图，只有标签对得上的参考图才替换
  const { id, url, width, height, thumbUrl } = matched ?? example.image
  return { id, url, width, height, thumbUrl }
}

function isSupportedVideoFile(file: File): boolean {
  if (file.type === 'video/mp4' || file.type === 'video/quicktime') return true
  return /\.(mp4|mov)$/i.test(file.name)
}

export function ToolLaunchModal({ tool, onClose }: { tool: ToolCatalogItem; onClose: () => void }) {
  const ds = useV2()
  const router = useRouter()
  const toast = useToast()
  const { requireAuth } = useV2Auth()
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const objectUrls = useRef(new Set<string>())
  const submitLock = useRef(false)
  const alive = useRef(true)

  const config = useMemo(() => getToolFormConfig(tool.id), [tool.id])
  const slots = useMemo(() => buildToolFormSlots(tool), [tool])
  const fields = useMemo(() => config.extraFields ?? [], [config.extraFields])
  const videoReplica = catalogToolIsVideoReplica(tool.id)
  const usesAgent = catalogToolUsesAgent(tool.id)
  const textOutput = catalogToolReturnsText(tool.id)
  const ratioOptions = config.ratios ?? TOOL_FORM_RATIOS
  const resolutionOptions = config.resolutions ?? ['2K', '4K']

  const [values, setValues] = useState<Record<string, SlotValue>>({})
  const [extras, setExtras] = useState<Record<string, string>>(() => initialExtras(fields))
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState(config.defaultRatio ?? '3:4')
  const [resolution, setResolution] = useState(config.fixedResolution ?? config.defaultResolution ?? '2K')
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [examples, setExamples] = useState<CasePage | null>(null)
  const [loadingExamples, setLoadingExamples] = useState(true)
  const [tab, setTab] = useState<'templates' | 'results'>('templates')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [items, setItems] = useState<CanvasItem[]>([])
  const [note, setNote] = useState('')
  const [submittedAt, setSubmittedAt] = useState<string>()
  const [statusLabel, setStatusLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<number | null>(null)

  useEffect(() => {
    alive.current = true
    const el = dialog.current
    if (el && !el.open) el.showModal()
    const urls = objectUrls.current
    return () => {
      alive.current = false
      urls.forEach(url => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoadingExamples(true)
    ds.listCasePage({ toolId: tool.id, limit: 12 })
      .then(page => { if (active) setExamples(page) })
      .catch(() => { if (active) setExamples({ cases: [], nextOffset: null, total: 0, facets: { categories: [], tools: [], months: [] } }) })
      .finally(() => { if (active) setLoadingExamples(false) })
    return () => { active = false }
  }, [ds, tool.id])

  const revokeIfOwned = (url?: string) => {
    if (url && objectUrls.current.delete(url)) URL.revokeObjectURL(url)
  }

  const updateSlot = (key: string, next?: SlotValue) => {
    setValues(current => {
      revokeIfOwned(current[key]?.url)
      if (!next) {
        const rest = { ...current }
        delete rest[key]
        return rest
      }
      return { ...current, [key]: next }
    })
  }

  const chooseFile = (slot: ToolFormSlot, file?: File) => {
    if (!file) return
    if (slot.accept === 'video') {
      if (!isSupportedVideoFile(file)) { toast('请上传 MP4 或 MOV 格式的参考视频'); return }
      if (file.size > VIDEO_MAX_BYTES) { toast('参考视频不能超过 80MB'); return }
      const url = URL.createObjectURL(file)
      objectUrls.current.add(url)
      updateSlot(slot.key, { url, name: file.name, file, mediaKind: 'video' })
      return
    }
    if (!file.type.startsWith('image/')) { toast('请选择图片文件'); return }
    if (file.size > MAX_UPLOAD_BYTES) { toast('单张图片不能超过 40MB'); return }
    const url = URL.createObjectURL(file)
    objectUrls.current.add(url)
    updateSlot(slot.key, { url, name: file.name, file, mediaKind: 'image' })
  }

  const ready = slots.every(slot => !slot.required || Boolean(values[slot.key]))
    && fields.every(field => !field.required || Boolean(extras[field.key]?.trim()))

  const uploadSlot = async (slot: ToolFormSlot): Promise<{ slot: ToolFormSlot; image: ImageRef }> => {
    const value = values[slot.key]
    if (!('file' in value)) return { slot, image: value.reference }
    const image = ds.uploadChatAttachment
      ? (await ds.uploadChatAttachment(value.file)).image
      : (await ds.uploadMaterial(value.file)).image
    return { slot, image }
  }

  const addReferences = async (id: string, references: Array<{ slot: ToolFormSlot; image: ImageRef }>) => {
    const canvasItems: CanvasItem[] = references.map(({ image }, index) => ({
      id: `src-${crypto.randomUUID()}`,
      ref: { type: 'material', id: image.id },
      image,
      x: index * 172,
      y: 0,
      w: 150,
      status: 'done',
    }))
    await ds.saveCanvas(id, canvasItems)
    return canvasItems
  }

  const onResult = (event: AgentEvent) => {
    if (!alive.current) return
    if (event.type === 'item-add') {
      setItems(previous => previous.some(item => item.id === event.item.id) ? previous : [...previous, event.item])
    } else if (event.type === 'item-update') {
      setItems(previous => previous.map(item => item.id === event.id ? { ...item, ...event.patch } : item))
    } else if (event.type === 'message' && event.message.role === 'assistant' && event.message.body) {
      setNote(event.message.body)
    } else if (event.type === 'message-update' && event.patch.body) {
      setNote(event.patch.body)
    } else if (event.type === 'error') {
      setError(event.message || '工具执行未完成')
      if (event.receiptRejected) setSubmitted(false)
    }
  }

  const openCanvas = (id: string) => {
    dialog.current?.close()
    router.push(`/v2/canvas/${id}`)
  }

  const submitReplica = async () => {
    const videoSlot = values[slots[0]?.key ?? 'slot_0']
    if (!videoSlot || !('file' in videoSlot)) {
      throw new Error('请先上传参考视频文件')
    }
    const productSlots = slots.slice(1, 4).filter(slot => Boolean(values[slot.key]))
    if (!productSlots.length) throw new Error('请至少上传 1 张商品主图')
    const modelSlot = slots[4]
    const selectedSlots = modelSlot && values[modelSlot.key] ? [...productSlots, modelSlot] : productSlots
    const references = await Promise.all(selectedSlots.map(uploadSlot))
    const project = await ds.createProject({ name: tool.name })
    if (!alive.current) return
    setProjectId(project.id)
    await addReferences(project.id, references)

    const storyboard = '【示例分镜】近景展示商品版型与面料细节，中景切换上身效果，定格突出核心卖点。'
    setNote(storyboard)
    if (extras.deliveryMode !== '仅拆解复刻分镜脚本') {
      setStatusLabel('正在准备演示视频…')
      await ds.sendMessage(project.id, {
        text: prompt.trim() || storyboard,
        mode: 'video',
        attachments: references.map(({ slot, image }) => ({ kind: 'upload', id: image.id, label: slot.label, image })),
        generation: { modelId: VIDEO_MODEL, ratio, resolution, count: 1, duration: Number.parseInt(extras.duration, 10) },
      }, onResult)
    }
    if (alive.current) setStatusLabel('演示结果已就绪')
  }

  const run = async () => {
    if (!alive.current) return
    if (!ready || busy || submitted || submitLock.current) return
    submitLock.current = true
    setSubmittedAt(new Date().toISOString())
    setBusy(true)
    setSubmitted(true)
    setError(null)
    setNote('')
    setItems([])
    setStatusLabel('')
    setTab('results')
    try {
      if (videoReplica) {
        await submitReplica()
        return
      }
      const filled = slots.filter(slot => Boolean(values[slot.key]))
      const uploaded: Array<{ slot: ToolFormSlot; image: ImageRef }> = []
      for (const slot of filled) uploaded.push(await uploadSlot(slot))
      const project = await ds.createProject({ name: tool.name })
      if (!alive.current) return
      setProjectId(project.id)
      const canvasItems = await addReferences(project.id, uploaded)
      if (usesAgent) {
        const detail = [
          `请使用「${tool.name}」处理已上传图片。`,
          ...fields.filter(field => extras[field.key]?.trim()).map(field => `${field.label}：${extras[field.key].trim()}`),
          `画面比例：${ratio}，清晰度：${config.fixedResolution ?? resolution}`,
          prompt.trim() && `补充要求：${prompt.trim()}`,
        ].filter(Boolean).join('；')
        const attachments: ChatAttachment[] = uploaded.map(({ slot, image }) => ({
          id: `att-${image.id}`,
          kind: 'upload',
          label: slot.label,
          image,
        }))
        const pending = { text: detail, mode: 'agent' as const, attachments }
        try { sessionStorage.setItem(PENDING_KEY(project.id), JSON.stringify(pending)) } catch {}
        openCanvas(project.id)
        return
      }

      const params: ToolParams = { ratio, resolution: config.fixedResolution ?? resolution }
      for (const field of fields) {
        const raw = extras[field.key]?.trim()
        if (raw) params[field.key] = field.kind === 'number' ? Number(raw) : raw
      }
      if (prompt.trim()) params.prompt = prompt.trim()
      if (tool.id === '80232' && values[slots[slots.length - 1].key]) params.hasModel = 1

      await ds.runTool(
        project.id,
        tool.id,
        canvasItems.map(item => item.id),
        onResult,
        params,
      )
    } catch (failure) {
      if (!alive.current) return
      if (!projectId || videoReplica) setSubmitted(false)
      setError(failure instanceof Error ? failure.message : '提交失败，请稍后重试')
    } finally {
      submitLock.current = false
      if (alive.current) setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void requireAuth(run)
  }

  const renderSlot = (slot: ToolFormSlot) => {
    const value = values[slot.key]
    const isVideo = slot.accept === 'video'
    return (
      <div className="tf-field" key={slot.key}>
        <div className="tf-field-h"><span>{slot.label}</span>{slot.required && <em>必填</em>}</div>
        <div className={`tf-drop${slots.length > 1 ? ' compact' : ''}${value ? ' filled' : ''}${dragKey === slot.key ? ' drag' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!busy && !submitted) setDragKey(slot.key) }}
          onDragLeave={() => setDragKey(null)}
          onDrop={event => { event.preventDefault(); setDragKey(null); if (!busy && !submitted) chooseFile(slot, event.dataTransfer.files[0]) }}>
          <label className="tf-upload-label">
            <input
              type="file"
              accept={isVideo ? 'video/mp4,video/quicktime,.mp4,.mov' : 'image/*'}
              aria-label={`上传${slot.label}`}
              disabled={busy || submitted}
              onChange={event => { chooseFile(slot, event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
            />
            {value ? (
              <span className="tf-preview">
                {isVideo ? (
                  <video src={value.url} muted playsInline preload="metadata" />
                ) : (
                  <img src={value.url} alt={value.name} />
                )}
                {'reference' in value && <span className="tf-tpl-badge">已选模板</span>}
              </span>
            ) : (
              <span className="tf-empty-drop">
                <span className="tf-drop-ic"><Icon name={isVideo ? 'video' : 'img'} size={20} /></span>
                <b>添加{slot.label}</b>
                {isVideo ? <small>支持 MP4 / MOV（≤80MB）</small> : slot.isTemplateTarget && <small>或选择参考模板</small>}
              </span>
            )}
          </label>
          {value && !busy && !submitted && <button type="button" className="tf-clear" aria-label={`清除${slot.label}`}
            onClick={() => updateSlot(slot.key)}><Icon name="x" size={13} /></button>}
        </div>
      </div>
    )
  }

  const changeExtra = (key: string, value: string) => setExtras(current => ({ ...current, [key]: value }))
  const optionalSlots = slots.filter(slot => !slot.required)
  const templateSlot = slots.find(slot => slot.isTemplateTarget)
  const complete = items.filter(item => item.status === 'done')
  const imageComplete = complete.filter(item => item.mediaType !== 'video')
  const heading = usesAgent ? '参考案例' : '参考模板'
  const copyNote = async () => {
    try { await navigator.clipboard.writeText(note); toast('已复制到剪贴板') }
    catch { toast('复制失败，请手动选中复制') }
  }
  const downloadStoryboard = () => {
    if (!note) return
    const blob = new Blob([`# ${tool.name} · 分镜复刻脚本\n\n${note}\n`], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${tool.name}-分镜脚本.md`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <dialog ref={dialog} className="tf-shell" aria-labelledby={titleId} onClose={onClose}>
      <button type="button" className="tf-close" aria-label="关闭工具" onClick={() => dialog.current?.close()}><Icon name="x" size={17} /></button>
      <form className="tf-form" onSubmit={submit}>
        <header className="tf-form-head">
          <h2 className="tf-title" id={titleId}>{tool.name}</h2>
        </header>
        <fieldset className="tf-scroll" disabled={busy || submitted}>
          {slots.filter(slot => slot.required).map(renderSlot)}
          {optionalSlots.length > 0 && (
            <div className="tf-opt-wrap">
              <button type="button" className="tf-opt-toggle" aria-expanded={optionalOpen}
                onClick={() => setOptionalOpen(value => !value)}>
                <Icon name={optionalOpen ? 'minus' : 'plus'} size={12} />
                {optionalOpen ? '收起可选图' : '添加可选参考图'}
              </button>
              {optionalOpen && <div className="tf-opt-grid">{optionalSlots.map(renderSlot)}</div>}
            </div>
          )}
          {fields.map(field => (
            <label className="tf-field" key={field.key}>
              <span className="tf-field-h">{field.label}{field.required && <em>必填</em>}</span>
              {field.kind === 'select' ? (
                <select className="tf-input" value={extras[field.key]} onChange={event => changeExtra(field.key, event.target.value)}>
                  {field.options?.map(option => <option key={option}>{option}</option>)}
                </select>
              ) : field.kind === 'textarea' ? (
                <textarea className="tf-textarea" rows={2} value={extras[field.key]} required={field.required} maxLength={1500}
                  onChange={event => changeExtra(field.key, event.target.value)} placeholder={field.placeholder} />
              ) : (
                <input className="tf-input" type={field.kind} min={field.min} max={field.max} required={field.required}
                  maxLength={1500} value={extras[field.key]} onChange={event => changeExtra(field.key, event.target.value)}
                  placeholder={field.placeholder} />
              )}
            </label>
          ))}
          {!config.hidePrompt && <label className="tf-field">
            <span className="tf-field-h">补充要求</span>
            <textarea className="tf-textarea" rows={2} maxLength={1500} value={prompt} onChange={event => setPrompt(event.target.value)} />
          </label>}
          {config.hint && <p className="tf-hint">{config.hint}</p>}
        </fieldset>
        <div className="tf-footer">
          {!textOutput && <div className="tf-settings">
            <label className="tf-pill-select">
              <Icon name="ratio" size={13} />
              <select aria-label="画面比例" value={ratio} disabled={busy || submitted} onChange={event => setRatio(event.target.value)}>
                {ratioOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            {config.fixedResolution ? <span className="tf-pill-btn">{config.fixedResolution}</span> : (
              <label className="tf-pill-select">
                <Icon name="spark" size={13} />
                <select aria-label="清晰度" value={resolution} disabled={busy || submitted} onChange={event => setResolution(event.target.value)}>
                  {resolutionOptions.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
            )}
          </div>}
          <button type="submit" className="tf-submit" disabled={!ready || busy || submitted}>
            {busy ? '处理中…' : submitted ? '已提交' : usesAgent ? '在画布中开始' : textOutput ? '开始分析' : '生成'}
          </button>
        </div>
      </form>

      <section className="tf-stage" aria-label={tab === 'results' ? '生成结果' : heading}>
        <div className="tf-stage-top">
          <div className="tf-stage-tabs">
            <button type="button" className={`tf-tab${tab === 'templates' ? ' on' : ''}`} aria-pressed={tab === 'templates'}
              onClick={() => setTab('templates')}>{heading}</button>
            {(busy || submitted || error) && <button type="button" className={`tf-tab${tab === 'results' ? ' on' : ''}`}
              aria-pressed={tab === 'results'} onClick={() => setTab('results')}>生成结果{complete.length > 0 ? ` (${complete.length})` : ''}</button>}
          </div>
          {projectId && (!busy || submitted) && <button type="button" className="tf-enter-canvas" onClick={() => openCanvas(projectId)}>
            进入画布 <Icon name="right" size={13} />
          </button>}
        </div>
        {tab === 'results' ? (
          <div className="tf-results-wrap">
            {error && <p className="tf-error" role="alert">{error}</p>}
            {busy && !error && !items.length && (
              <div><p role="status">{statusLabel || (textOutput ? '正在分析图片…' : '正在准备生成任务…')}</p>
                <ProcessingFeedback startedAt={submittedAt} kind={videoReplica ? 'video' : textOutput ? 'text' : 'image'}
                  estimatedDurationMs={videoReplica || usesAgent ? undefined : toolDurationMs(tool.id)} />
              </div>
            )}
            {(textOutput || videoReplica) && note && (
              <div className="tf-note">
                <p>{note}</p>
                <div className="tf-note-actions">
                  <button type="button" className="tf-copy-btn" onClick={() => void copyNote()}>复制内容</button>
                  {videoReplica && (
                    <button type="button" className="tf-copy-btn" onClick={downloadStoryboard}>下载分镜脚本</button>
                  )}
                </div>
              </div>
            )}
            <div className="tf-results-grid">
              {items.map(item => {
                const isVideoItem = item.mediaType === 'video' && Boolean(item.video?.url)
                return (
                  <div key={item.id} className={`tf-res-card${isVideoItem ? ' video-card' : ''}${item.status === 'running' ? ' loading' : ''}`}>
                    {item.status === 'done' ? (
                      isVideoItem && item.video ? (
                        <>
                          <video
                            className="tf-result-video"
                            src={item.video.url}
                            poster={item.image.url}
                            controls
                            playsInline
                            preload="metadata"
                          />
                          <div className="tf-res-bar">
                            <a href={`${item.video.url}${item.video.url.includes('?') ? '&' : '?'}download=1`} download>
                              <Icon name="down" size={12} />下载视频
                            </a>
                          </div>
                        </>
                      ) : (
                        <>
                          <button type="button" className="tf-result-image" aria-label="预览结果"
                            onClick={() => setPreview(imageComplete.findIndex(result => result.id === item.id))}>
                            <img src={item.image.thumbUrl ?? item.image.url} alt={tool.name} />
                          </button>
                          <div className="tf-res-bar"><a href={item.image.url} download><Icon name="down" size={12} />下载</a></div>
                        </>
                      )
                    ) : item.status === 'running' ? (
                      <><div className="tf-res-skel" /><span role="status">{statusLabel || generationDisplay(item).label}</span>
                        {busy && !error && item.generationPhase !== 'unconfirmed' && <ProcessingFeedback startedAt={item.startedAt ?? submittedAt}
                          estimatedDurationMs={item.estimatedDurationMs} phase={item.generationPhase} kind={videoReplica || item.mediaType === 'video' ? 'video' : textOutput ? 'text' : 'image'} />}
                      </>
                    ) : <span className="tf-result-failed">{item.errorMessage || '生成失败'}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="tf-guide-wrap">
            <div className="tf-hero">
              {(tool.cover.after || tool.cover.before) && <div className="tf-hero-img">
                <img src={tool.cover.after || tool.cover.before} alt="" />
              </div>}
              <p>{tool.desc}</p>
            </div>
            {loadingExamples && <p className="tf-hint" role="status">正在加载案例…</p>}
            <div className="tf-tpl-grid">
              {examples?.cases.map(example => {
                const image = <img src={example.image.thumbUrl ?? example.image.url} alt={example.title} loading="lazy" />
                if (!templateSlot) return <div className="tf-tpl-card" key={example.id}>{image}</div>
                const reference = templateReference(example, templateSlot)
                const value = values[templateSlot.key]
                const selected = value && 'reference' in value && value.reference.id === reference.id
                return <button type="button" className={`tf-tpl-card${selected ? ' on' : ''}`} key={example.id}
                  aria-pressed={Boolean(selected)} disabled={busy || submitted} onClick={() => {
                    updateSlot(templateSlot.key, { reference, url: reference.thumbUrl ?? reference.url, name: example.title })
                    if (!templateSlot.required) setOptionalOpen(true)
                  }}>
                  {image}<span className="tf-tpl-hover">{selected ? '已选为参考模板' : '用作参考模板'}</span>
                </button>
              })}
            </div>
          </div>
        )}
      </section>
      {preview !== null && preview >= 0 && <Lightbox items={imageComplete} index={preview} onIndexChange={setPreview} onClose={() => setPreview(null)} />}
    </dialog>
  )
}
