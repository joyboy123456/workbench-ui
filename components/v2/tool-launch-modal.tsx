'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { useV2, type AgentEvent } from '@/lib/v2/data-source'
import type { CanvasItem, CaseExample, ImageRef, ToolCatalogItem, ToolParams } from '@/lib/v2/types'
import { Icon } from './icons'
import { Lightbox } from './lightbox'
import { useToast } from './ui'
import { useV2Auth } from './auth'

export interface ToolFormSlot {
  key: string
  label: string
  required: boolean
  isTemplateTarget: boolean
}

export interface SlotValue {
  url: string
  name: string
  file?: File
  imageRef?: ImageRef
  fromTemplate?: boolean
}

const DEFAULT_SLOTS_BY_TOOL: Record<string, string[]> = {
  '701': ['商品图', '风格/模特参考图（可选）'],
  '705': ['服装主图'],
  '706': ['服装模特图'],
  '707': ['商品主图', '细节参考图（可选）'],
  '80212': ['待换面料服装图', '目标面料/花型图'],
}

const RATIO_OPTIONS = ['3:4', '1:1', '2:3', '9:16', '16:9'] as const
const RESOLUTION_OPTIONS = ['2K', '4K'] as const

/** 按 clothing-tool-catalog.json 的 inputs 规则生成表单上传槽位 */
export function buildToolFormSlots(tool: Pick<ToolCatalogItem, 'id' | 'inputs'>): ToolFormSlot[] {
  const raw = tool.inputs.length > 0 ? tool.inputs : (DEFAULT_SLOTS_BY_TOOL[tool.id] ?? ['商品图', '参考图（可选）'])
  const parsed = raw.map((label, idx) => {
    const optional = /可选|选填/.test(label)
    const cleanLabel = label.replace(/[（(]s*(可选|选填)s*[）)]/g, '').trim()
    return {
      key: `slot_${idx}`,
      label: cleanLabel || label,
      required: !optional,
      isTemplateTarget: false,
    }
  })
  const refIdx = parsed.findIndex(s => /参考|版式|海报|风格|模特|背景|目标/.test(s.label))
  const targetIdx = refIdx >= 0 ? refIdx : 0
  if (parsed[targetIdx]) parsed[targetIdx].isTemplateTarget = true
  return parsed
}

export function ToolLaunchModal({ tool, onClose }: { tool: ToolCatalogItem; onClose: () => void }) {
  const ds = useV2()
  const router = useRouter()
  const toast = useToast()
  const { requireAuth } = useV2Auth()

  const slots = useMemo(() => buildToolFormSlots(tool), [tool])
  const requiredSlots = useMemo(() => slots.filter(s => s.required), [slots])
  const optionalSlots = useMemo(() => slots.filter(s => !s.required), [slots])
  const templateSlot = useMemo(() => slots.find(s => s.isTemplateTarget) ?? slots[0], [slots])

  const [values, setValues] = useState<Record<string, SlotValue>>({})
  const [showOptional, setShowOptional] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<string>('3:4')
  const [resolution, setResolution] = useState<string>('2K')
  const [dragKey, setDragKey] = useState<string | null>(null)

  const [templates, setTemplates] = useState<CaseExample[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  const [rightTab, setRightTab] = useState<'templates' | 'results'>('templates')
  const [running, setRunning] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [resultItems, setResultItems] = useState<CanvasItem[]>([])
  const [resultNote, setResultNote] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const [host, setHost] = useState<HTMLElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.v2') ?? document.body)
  }, [])

  useEffect(() => {
    return () => {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewIndex === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, previewIndex])

  useEffect(() => {
    let alive = true
    setLoadingTemplates(true)
    ;(async () => {
      try {
        const page = await ds.listCasePage({ toolId: tool.id, limit: 12 })
        if (!alive) return
        if (page.cases.length > 0) {
          setTemplates(page.cases)
        } else {
          const fallback = await ds.listCases()
          if (alive) setTemplates(fallback.slice(0, 9))
        }
      } catch {
        if (alive) setTemplates([])
      } finally {
        if (alive) setLoadingTemplates(false)
      }
    })()
    return () => { alive = false }
  }, [ds, tool.id])

  const setFileForSlot = (key: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('请上传图片文件')
      return
    }
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    setValues(prev => ({ ...prev, [key]: { url, name: file.name, file, fromTemplate: false } }))
    if (templateSlot && key === templateSlot.key) setSelectedTemplateId(null)
  }

  const clearSlot = (key: string) => {
    setValues(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (templateSlot && key === templateSlot.key) setSelectedTemplateId(null)
  }

  const handleSelectTemplate = (c: CaseExample) => {
    if (!templateSlot) return
    const imgUrl = c.image.thumbUrl || c.image.url
    setValues(prev => ({
      ...prev,
      [templateSlot.key]: {
        url: imgUrl,
        name: c.title,
        imageRef: c.image,
        fromTemplate: true,
      },
    }))
    setSelectedTemplateId(c.id)
    if (!templateSlot.required) setShowOptional(true)
  }

  const handleInputChange = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFileForSlot(key, file)
    e.target.value = ''
  }

  const handleDrop = (key: string) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragKey(null)
    const file = e.dataTransfer.files?.[0]
    if (file) setFileForSlot(key, file)
  }

  const readyToGenerate = requiredSlots.every(s => Boolean(values[s.key])) && !running

  const handleGenerate = async () => {
    if (!readyToGenerate) return
    await requireAuth(async () => {
      setRunning(true)
      setErrorMsg(null)
      setResultNote(null)
      setRightTab('results')

      try {
        let activeProjectId = projectId
        if (!activeProjectId) {
          const created = await ds.createProject({ name: tool.name })
          activeProjectId = created.id
          setProjectId(created.id)
        }

        const sourceItems: CanvasItem[] = []
        let refImage: ImageRef | undefined

        for (let i = 0; i < slots.length; i += 1) {
          const slot = slots[i]
          const val = values[slot.key]
          if (!val) continue
          let imgRef: ImageRef | undefined = val.imageRef
          if (val.file) {
            const mat = await ds.uploadMaterial(val.file)
            imgRef = mat.image
          }
          if (imgRef) {
            if (slot.isTemplateTarget) refImage = imgRef
            sourceItems.push({
              id: `src_${slot.key}_${Date.now()}_${i}`,
              ref: { type: 'material', id: imgRef.id },
              image: imgRef,
              x: i * 180,
              y: 0,
              w: 150,
              status: 'done',
            })
          }
        }

        if (sourceItems.length > 0) {
          await ds.saveCanvas(activeProjectId, sourceItems)
        }

        const params: ToolParams = {
          ratio,
          resolution,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(refImage ? { reference: refImage } : {}),
        }

        const onEvent = (ev: AgentEvent) => {
          if (ev.type === 'item-add') {
            setResultItems(prev => {
              const exists = prev.some(x => x.id === ev.item.id)
              return exists ? prev.map(x => x.id === ev.item.id ? ev.item : x) : [ev.item, ...prev]
            })
          } else if (ev.type === 'item-update') {
            setResultItems(prev => prev.map(x => x.id === ev.id ? { ...x, ...ev.patch } : x))
          } else if (ev.type === 'message' && ev.message.role === 'assistant' && ev.message.body) {
            setResultNote(ev.message.body)
          } else if (ev.type === 'error') {
            setErrorMsg(ev.message)
          }
        }

        await ds.runTool(
          activeProjectId,
          tool.id,
          sourceItems.map(item => item.id),
          onEvent,
          params,
        )
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : '生成失败，请稍后重试')
      } finally {
        setRunning(false)
      }
    })
  }

  const handleOpenInCanvas = () => {
    if (!projectId) return
    onClose()
    router.push(`/v2/canvas/${projectId}?view=split`)
  }

  if (!host) return null

  const heroImg = tool.cover.after || tool.cover.before
  const compactDropzone = requiredSlots.length >= 3

  return createPortal(
    <div className="tf-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tf-shell" role="dialog" aria-modal="true" aria-label={tool.name}>
        {/* 左侧表单卡（对齐即梦 400px 圆角表单结构） */}
        <aside className="tf-form">
          <div className="tf-form-head">
            <h2 className="tf-title">{tool.name}</h2>
            <span className="tf-tag">表单模式</span>
          </div>

          <div className="tf-scroll">
            {requiredSlots.map(slot => {
              const val = values[slot.key]
              return (
                <div key={slot.key} className="tf-field">
                  <div className="tf-field-h">
                    <span>{slot.label}</span>
                    <em>必填 {val ? '1/1' : '0/1'}</em>
                  </div>
                  <label
                    className={
                      'tf-drop' +
                      (compactDropzone ? ' compact' : '') +
                      (val ? ' filled' : '') +
                      (dragKey === slot.key ? ' drag' : '')
                    }
                    onDragOver={e => { e.preventDefault(); setDragKey(slot.key) }}
                    onDragLeave={() => setDragKey(k => k === slot.key ? null : k)}
                    onDrop={handleDrop(slot.key)}
                  >
                    <input type="file" accept="image/*" hidden onChange={handleInputChange(slot.key)} />
                    {val ? (
                      <div className="tf-preview">
                        <img src={val.url} alt={val.name} />
                        {val.fromTemplate && <span className="tf-tpl-badge">已选右侧模板</span>}
                        <button
                          type="button"
                          className="tf-clear"
                          aria-label={`清除${slot.label}`}
                          onClick={e => { e.preventDefault(); e.stopPropagation(); clearSlot(slot.key) }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="tf-empty-drop">
                        <span className="tf-drop-ic"><Icon name="img" size={20} /></span>
                        <b>添加{slot.label}</b>
                        {slot.isTemplateTarget && <small>或选择右侧模板</small>}
                      </div>
                    )}
                  </label>
                </div>
              )
            })}

            {optionalSlots.length > 0 && (
              <div className="tf-opt-wrap">
                <button
                  type="button"
                  className="tf-opt-toggle"
                  onClick={() => setShowOptional(v => !v)}
                >
                  <Icon name={showOptional ? 'minus' : 'plus'} size={12} />
                  <span>{showOptional ? '收起可选细节图' : `添加更多参考/细节图（可选 ${optionalSlots.length} 项）`}</span>
                </button>
                {showOptional && (
                  <div className="tf-opt-grid">
                    {optionalSlots.map(slot => {
                      const val = values[slot.key]
                      return (
                        <label key={slot.key} className={'tf-drop mini' + (val ? ' filled' : '')}>
                          <input type="file" accept="image/*" hidden onChange={handleInputChange(slot.key)} />
                          {val ? (
                            <div className="tf-preview">
                              <img src={val.url} alt={val.name} />
                              <button
                                type="button"
                                className="tf-clear"
                                aria-label={`清除${slot.label}`}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); clearSlot(slot.key) }}
                              >
                                <Icon name="x" size={11} />
                              </button>
                            </div>
                          ) : (
                            <div className="tf-empty-drop">
                              <Icon name="plus" size={14} />
                              <small>{slot.label}</small>
                            </div>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="tf-field">
              <div className="tf-field-h">
                <span>补充要求</span>
              </div>
              <textarea
                className="tf-textarea"
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="填写商品名称、卖点、风格或活动文案（选填）"
              />
            </div>
          </div>

          <div className="tf-footer">
            <div className="tf-settings">
              <label className="tf-pill-select" title="画面比例">
                <Icon name="ratio" size={13} />
                <select value={ratio} onChange={e => setRatio(e.target.value)}>
                  {RATIO_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="tf-pill-btn"
                onClick={() => setResolution(r => r === '2K' ? '4K' : '2K')}
                title="切换清晰度"
              >
                <Icon name="spark" size={13} />
                <span>{resolution}</span>
              </button>
            </div>
            <button
              type="button"
              className="tf-submit"
              disabled={!readyToGenerate}
              onClick={() => void handleGenerate()}
            >
              {running ? '生成中…' : '生成'}
            </button>
          </div>
        </aside>

        {/* 右侧：引导头图 + 可选模板库 ↔ 实时生成结果区 */}
        <section className="tf-stage">
          <div className="tf-stage-top">
            <div className="tf-stage-tabs">
              {(resultItems.length > 0 || running || resultNote || errorMsg) && (
                <>
                  <button
                    type="button"
                    className={'tf-tab' + (rightTab === 'results' ? ' on' : '')}
                    onClick={() => setRightTab('results')}
                  >
                    生成结果 {resultItems.length > 0 ? `(${resultItems.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className={'tf-tab' + (rightTab === 'templates' ? ' on' : '')}
                    onClick={() => setRightTab('templates')}
                  >
                    参考模板
                  </button>
                </>
              )}
            </div>
            <div className="tf-stage-actions">
              {projectId && (
                <button type="button" className="tf-enter-canvas" onClick={handleOpenInCanvas}>
                  <span>进入画布继续编辑</span>
                  <Icon name="right" size={13} />
                </button>
              )}
              <button type="button" className="tf-close" onClick={onClose} aria-label="关闭">
                <Icon name="x" size={16} />
              </button>
            </div>
          </div>

          {rightTab === 'results' ? (
            <div className="tf-results-wrap">
              <div className="tf-results-head">
                <div>
                  <h3>{running ? '正在生成作品…' : '生成结果'}</h3>
                  <p>{running ? '你可以在当前弹层直接查看进度，完成后可一键进入画布精修' : '满意可直接下载，或点击右上角「进入画布继续编辑」做二次创作'}</p>
                </div>
              </div>

              {errorMsg && <div className="tf-error">{errorMsg}</div>}
              {resultNote && <div className="tf-note">{resultNote}</div>}

              <div className="tf-results-grid">
                {running && resultItems.length === 0 && (
                  <div className="tf-res-card loading">
                    <div className="tf-res-skel" />
                    <span>准备生成任务…</span>
                  </div>
                )}
                {resultItems.map((item, idx) => {
                  const isPending = item.status === 'running'
                  return (
                    <div key={item.id} className={'tf-res-card' + (isPending ? ' loading' : '')}>
                      {isPending ? (
                        <>
                          <div className="tf-res-skel" />
                          <span>生成中 {typeof item.progress === 'number' ? `${Math.round(item.progress)}%` : '…'}</span>
                        </>
                      ) : (
                        <>
                          <img
                            src={item.image.thumbUrl || item.image.url}
                            alt={tool.name}
                            onClick={() => setPreviewIndex(idx)}
                          />
                          <div className="tf-res-bar">
                            <button type="button" onClick={() => setPreviewIndex(idx)}>
                              <Icon name="search" size={12} />预览
                            </button>
                            <a href={item.image.url} download={`${tool.name}.png`}>
                              <Icon name="down" size={12} />下载
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="tf-guide-wrap">
              <div className="tf-hero">
                {heroImg && (
                  <div className="tf-hero-img">
                    <img src={heroImg} alt={tool.name} />
                  </div>
                )}
                <h3>{tool.name}</h3>
                <p>{tool.desc}</p>
              </div>

              {loadingTemplates ? (
                <div className="tf-tpl-grid">
                  {Array.from({ length: 6 }, (_, i) => <div key={i} className="tf-tpl-skel" />)}
                </div>
              ) : templates.length > 0 ? (
                <div className="tf-tpl-grid">
                  {templates.map(c => {
                    const selected = selectedTemplateId === c.id
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={'tf-tpl-card' + (selected ? ' on' : '')}
                        onClick={() => handleSelectTemplate(c)}
                      >
                        <img src={c.image.thumbUrl || c.image.url} alt={c.title} loading="lazy" />
                        <span className="tf-tpl-hover">{selected ? '已选为参考模板' : '点击用作参考模板'}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
      {previewIndex !== null && resultItems[previewIndex] && (
        <Lightbox
          items={resultItems.map(item => ({ id: item.id, image: item.image, title: tool.name }))}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>,
    host,
  )
}
