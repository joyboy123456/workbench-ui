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

export interface ToolExtraField {
  key: string
  label: string
  kind: 'text' | 'select' | 'number' | 'textarea'
  required?: boolean
  placeholder?: string
  options?: string[]
  defaultValue?: string
  min?: number
  max?: number
}

export interface ToolFormConfig {
  slots?: string[]
  extraFields?: ToolExtraField[]
  defaultRatio?: string
  fixedResolution?: string
  isTextOutput?: boolean
  hidePrompt?: boolean
  hint?: string
}

export interface SlotValue {
  url: string
  name: string
  file?: File
  imageRef?: ImageRef
  fromTemplate?: boolean
}

/** 对齐 joyboy123456/workbench clothing-tool-panel.tsx 的全部 28 个工具表单配置 */
export const TOOL_FORM_CONFIGS: Record<string, ToolFormConfig> = {
  '701': {
    slots: ['商品图', '风格/模特参考图（可选）'],
    extraFields: [{ key: 'count', label: '生成张数', kind: 'select', options: ['1', '2', '4'], defaultValue: '2' }],
  },
  '705': {
    slots: ['服装主图'],
    extraFields: [{ key: 'count', label: '机位套图张数', kind: 'select', options: ['2', '4', '8', '16'], defaultValue: '4' }],
  },
  '706': {
    slots: ['服装模特图'],
    extraFields: [{ key: 'count', label: '姿势裂变张数', kind: 'select', options: ['2', '4', '6', '8'], defaultValue: '4' }],
  },
  '80262': {
    slots: ['人物底图', '服装参考图', '服装细节图 1（可选）', '服装细节图 2（可选）'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：连衣裙、西装外套' },
      { key: 'scene', label: '场景与光影', kind: 'text', placeholder: '留空保持原环境' },
    ],
  },
  '709': {
    slots: ['人物底图', '服装参考图', '服装细节图 1（可选）', '服装细节图 2（可选）'],
    extraFields: [{ key: 'count', label: '组合出图数', kind: 'select', options: ['2', '4', '6'], defaultValue: '4' }],
  },
  '702': {
    slots: ['原图', '替换对象参考图'],
    extraFields: [{ key: 'replaceMode', label: '替换模式', kind: 'select', options: ['替换环境/背景', '替换鞋子/配饰', '替换模特', '替换指定主体'], defaultValue: '替换环境/背景' }],
  },
  '80232': {
    slots: ['产品图', '产品细节图 1（可选）', '产品细节图 2（可选）', '指定模特图（可选）'],
    defaultRatio: '2:3',
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：女装外套、针织衫' },
      { key: 'screenCount', label: '详情屏数（1–10 屏）', kind: 'number', min: 1, max: 10, defaultValue: '3' },
    ],
    hint: '每屏单独生成并保存，完成后可在右侧逐屏查看或进入画布拼接长图。',
  },
  '80231': {
    slots: ['商品图', '版式参考图', '同款商品细节图 1（可选）', '同款商品细节图 2（可选）'],
    extraFields: [
      { key: 'productCategory', label: '商品品类', kind: 'text', placeholder: '例如：连衣裙、防晒衣' },
      { key: 'sellingPoints', label: '标题与卖点', kind: 'textarea', placeholder: '仅填写已确认的商品卖点或活动文案' },
    ],
  },
  '707': {
    slots: ['商品图', '细节参考图（可选）'],
    extraFields: [
      { key: 'detailStyle', label: '套图类型', kind: 'select', options: ['白底商品图', '3D 悬浮展示', '面料部位特写', '多场景电商套图'], defaultValue: '多场景电商套图' },
      { key: 'count', label: '生成张数', kind: 'select', options: ['2', '4', '6'], defaultValue: '4' },
    ],
  },
  '80212': {
    slots: ['服装图', '目标面料/花型参考图（可选）'],
    extraFields: [
      { key: 'editMode', label: '换色模式', kind: 'select', options: ['按参考图替换花型/面料', '同料换色（文字指定颜色）'], defaultValue: '按参考图替换花型/面料' },
    ],
  },
  '80305': {
    slots: ['服装商品图', '配色参考图（可选）'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'select', options: ['上衣', '外套', '连衣裙', '裤装', '针织衫', '卫衣'], defaultValue: '上衣' },
      { key: 'colorDirections', label: '配色方向', kind: 'textarea', placeholder: '例如：奶油白、雾霾蓝、焦糖棕（可填 HEX 色值）' },
    ],
  },
  '80213': {
    slots: ['改款参考图', '待修改原款图'],
    extraFields: [
      { key: 'element', label: '参考款式元素', kind: 'text', placeholder: '例如：V 领设计、泡泡袖、腰部抽绳' },
      { key: 'position', label: '原款改动位置', kind: 'text', placeholder: '例如：领口与袖口' },
    ],
  },
  '80216': {
    slots: ['原款图'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：卫衣、衬衫' },
      { key: 'designCount', label: '单图款式方案数', kind: 'number', min: 1, max: 9, defaultValue: '4' },
    ],
  },
  '80217': {
    slots: ['款式参考图 1', '款式参考图 2', '款式参考图 3（可选）', '款式参考图 4（可选）'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：夹克、风衣' },
      { key: 'designCount', label: '融合方案数', kind: 'number', min: 1, max: 4, defaultValue: '1' },
    ],
  },
  '80215': {
    slots: ['服装图（单面）'],
    extraFields: [
      { key: 'categoryName', label: '服装名称', kind: 'text', required: true, placeholder: '必填，例如：衬衫、连衣裙、羽绒服' },
    ],
  },
  '80238': {
    slots: ['商品底图', '图案或 Logo 素材'],
    extraFields: [
      { key: 'placement', label: '图案贴合位置', kind: 'select', options: ['胸前居中', '左胸口小标', '后背居中', '袖口/下摆'], defaultValue: '胸前居中' },
    ],
  },
  '80244': {
    slots: ['原图'],
    hint: '自动移除背景并输出透明底 PNG。',
  },
  '80242': {
    slots: ['待放大图片'],
    fixedResolution: '4K',
    hint: '生成式画质增强至 4K，适合老旧糊图提清。',
  },
  '80240': {
    slots: ['待修复原图', '细节参考图（可选）'],
    extraFields: [
      { key: 'position', label: '需修复的部位', kind: 'text', required: true, placeholder: '必填，例如：左手手指、衣领褶皱' },
    ],
  },
  '80243': {
    slots: ['待处理原图'],
  },
  '80239': {
    slots: ['待校色图', '目标色彩参考图'],
  },
  '80245': {
    slots: ['待转换原图'],
    defaultRatio: '1:1',
  },
  '80301': {
    slots: ['带花型的服装或面料图'],
    defaultRatio: '1:1',
    extraFields: [
      { key: 'seamless', label: '平铺方式', kind: 'select', options: ['四方连续平铺', '单幅平面花型'], defaultValue: '四方连续平铺' },
    ],
  },
  '80302': {
    slots: ['待处理面料图'],
    hidePrompt: true,
    extraFields: [
      { key: 'cleanLevel', label: '去布纹强度', kind: 'select', options: ['轻度保留质感', '标准清理', '强力平整'], defaultValue: '标准清理' },
    ],
  },
  '80303': {
    slots: ['家纺产品主图', '同商品细节图 1（可选）', '同商品细节图 2（可选）'],
    extraFields: [
      { key: 'categoryName', label: '家纺品类', kind: 'select', options: ['四件套', '被芯', '枕套', '毛毯', '窗帘'], defaultValue: '四件套' },
      { key: 'textileMode', label: '裂变模式', kind: 'select', options: ['多场景套图', '多机位视角'], defaultValue: '多场景套图' },
    ],
  },
  '80304': {
    slots: ['原花型或成品图'],
    defaultRatio: '1:1',
    extraFields: [
      { key: 'scenarios', label: '花型风格方向', kind: 'textarea', placeholder: '每行一个风格，例如：法式碎花、极简条纹、莫兰迪几何' },
    ],
  },
  '80263': {
    slots: ['图片'],
    isTextOutput: true,
    hint: '视觉分析模型，完成后在右侧直接输出可一键复制的中文提示词。',
  },
  '80264': {
    slots: ['海报图'],
    isTextOutput: true,
    hint: '拆解海报的构图、排版层级与视觉风格，完成后可在右侧一键复制。',
  },
}

const RATIO_OPTIONS = ['3:4', '1:1', '2:3', '9:16', '16:9'] as const
const RESOLUTION_OPTIONS = ['2K', '4K'] as const

export function getToolFormConfig(toolId: string): ToolFormConfig {
  return TOOL_FORM_CONFIGS[toolId] ?? {}
}

/** 按 workbench 28 工具配置 + tool.inputs 规则生成表单上传槽位 */
export function buildToolFormSlots(tool: Pick<ToolCatalogItem, 'id' | 'inputs'>): ToolFormSlot[] {
  const cfg = TOOL_FORM_CONFIGS[tool.id]
  const raw = cfg?.slots?.length
    ? cfg.slots
    : tool.inputs.length > 0
      ? tool.inputs
      : ['商品图', '参考图（可选）']
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
  const refIdx = parsed.findIndex(s => /参考|版式|海报|风格|模特|背景|目标|面料/.test(s.label))
  const targetIdx = refIdx >= 0 ? refIdx : 0
  if (parsed[targetIdx]) parsed[targetIdx].isTemplateTarget = true
  return parsed
}

export function ToolLaunchModal({ tool, onClose }: { tool: ToolCatalogItem; onClose: () => void }) {
  const ds = useV2()
  const router = useRouter()
  const toast = useToast()
  const { requireAuth } = useV2Auth()

  const config = useMemo(() => getToolFormConfig(tool.id), [tool.id])
  const extraFields = config.extraFields ?? []
  const slots = useMemo(() => buildToolFormSlots(tool), [tool])
  const requiredSlots = useMemo(() => slots.filter(s => s.required), [slots])
  const optionalSlots = useMemo(() => slots.filter(s => !s.required), [slots])
  const templateSlot = useMemo(() => slots.find(s => s.isTemplateTarget) ?? slots[0], [slots])

  const [values, setValues] = useState<Record<string, SlotValue>>({})
  const [extras, setExtras] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of extraFields) {
      if (f.defaultValue !== undefined) init[f.key] = f.defaultValue
    }
    return init
  })
  const [showOptional, setShowOptional] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<string>(config.defaultRatio ?? '3:4')
  const [resolution, setResolution] = useState<string>(config.fixedResolution ?? '2K')
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

  const requiredExtrasFilled = extraFields
    .filter(f => f.required)
    .every(f => Boolean((extras[f.key] ?? '').trim()))
  const readyToGenerate = requiredSlots.every(s => Boolean(values[s.key])) && requiredExtrasFilled && !running

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
          ...(config.isTextOutput ? {} : { ratio, resolution }),
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(refImage ? { reference: refImage } : {}),
        }
        for (const f of extraFields) {
          const rawVal = (extras[f.key] ?? '').trim()
          if (!rawVal) continue
          params[f.key] = f.kind === 'number' || f.key === 'count' ? Number(rawVal) || rawVal : rawVal
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

        const runId = config.isTextOutput ? 'describe' : tool.id
        await ds.runTool(
          activeProjectId,
          runId,
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

  const handleCopyNote = async () => {
    if (!resultNote) return
    try {
      await navigator.clipboard.writeText(resultNote)
      toast('已复制到剪贴板')
    } catch {
      toast('复制失败，请手动选中复制')
    }
  }

  if (!host) return null

  const heroImg = tool.cover.after || tool.cover.before
  const compactDropzone = requiredSlots.length >= 2 || extraFields.length >= 2

  return createPortal(
    <div className="tf-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tf-shell" role="dialog" aria-modal="true" aria-label={tool.name}>
        {/* 左侧 396px 圆角表单卡 */}
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
                  <span>{showOptional ? '收起可选图' : `添加更多参考/细节图（可选 ${optionalSlots.length} 项）`}</span>
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

            {/* 工具专属业务字段（来自 joyboy123456/workbench） */}
            {extraFields.map(field => (
              <div key={field.key} className="tf-field">
                <div className="tf-field-h">
                  <span>{field.label}</span>
                  {field.required && <em>必填</em>}
                </div>
                {field.kind === 'select' ? (
                  <select
                    className="tf-input"
                    value={extras[field.key] ?? field.defaultValue ?? ''}
                    onChange={e => setExtras(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.kind === 'textarea' ? (
                  <textarea
                    className="tf-textarea"
                    rows={2}
                    value={extras[field.key] ?? ''}
                    onChange={e => setExtras(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <input
                    className="tf-input"
                    type={field.kind === 'number' ? 'number' : 'text'}
                    min={field.min}
                    max={field.max}
                    value={extras[field.key] ?? ''}
                    onChange={e => setExtras(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}

            {!config.hidePrompt && (
              <div className="tf-field">
                <div className="tf-field-h">
                  <span>补充要求</span>
                </div>
                <textarea
                  className="tf-textarea"
                  rows={2}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="填写商品名称、卖点、风格或活动文案（选填）"
                />
              </div>
            )}

            {config.hint && <p className="tf-hint">{config.hint}</p>}
          </div>

          <div className="tf-footer">
            {!config.isTextOutput && (
              <div className="tf-settings">
                <label className="tf-pill-select" title="画面比例">
                  <Icon name="ratio" size={13} />
                  <select value={ratio} onChange={e => setRatio(e.target.value)}>
                    {RATIO_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                {config.fixedResolution ? (
                  <span className="tf-pill-btn" title="固定清晰度">
                    <Icon name="spark" size={13} />
                    <span>{config.fixedResolution}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="tf-pill-btn"
                    onClick={() => setResolution(r => r === '2K' ? '4K' : '2K')}
                    title="切换清晰度"
                  >
                    <Icon name="spark" size={13} />
                    <span>{resolution}</span>
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              className="tf-submit"
              disabled={!readyToGenerate}
              onClick={() => void handleGenerate()}
            >
              {running ? '生成中…' : config.isTextOutput ? '开始分析' : '生成'}
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
              {projectId && !config.isTextOutput && (
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
                  <h3>{running ? (config.isTextOutput ? '正在分析图片…' : '正在生成作品…') : '生成结果'}</h3>
                  <p>
                    {running
                      ? '你可以在当前弹层直接查看进度，完成后可一键进入画布精修'
                      : config.isTextOutput
                        ? '分析结果已就绪，可直接一键复制使用'
                        : '满意可直接下载，或点击右上角「进入画布继续编辑」做二次创作'}
                  </p>
                </div>
              </div>

              {errorMsg && <div className="tf-error">{errorMsg}</div>}
              {resultNote && (
                <div className="tf-note">
                  <p>{resultNote}</p>
                  <button type="button" className="tf-copy-btn" onClick={() => void handleCopyNote()}>
                    复制内容
                  </button>
                </div>
              )}

              {!config.isTextOutput && (
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
              )}
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
