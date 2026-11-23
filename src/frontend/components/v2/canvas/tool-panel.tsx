'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { V2_DISPLAY } from '@/lib/v2/display-config'
import { toAssetReferenceChoices, type AssetReferenceChoice } from '@/lib/v2/asset-choices'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { CanvasItem, ImageRef, ToolDef, ToolField, ToolParams } from '@/lib/v2/types'
import { Icon } from '../icons'
import { pickFiles, useToast } from '../ui'
import { adjustmentFilter } from '@/lib/v2/canvas-raster'

/** 字段默认值 */
export function defaultParams(def: ToolDef): ToolParams {
  const out: ToolParams = {}
  for (const f of def.fields ?? []) out[f.id] = f.default
  return out
}

/** 调色参数 → CSS filter（实时预览用；保存时由后端或 canvas 烘焙） */
export function filterCss(p: ToolParams) {
  return adjustmentFilter(p)
}

export function ratioOf(p: ToolParams, def: ToolDef) {
  const f = def.fields?.find((x) => x.ratio)
  const v = f ? String(p[f.id] ?? f.default ?? '') : ''
  const [a, b] = v.split(':').map(Number)
  return a && b ? a / b : undefined
}

export interface ToolPanelProps {
  def: ToolDef
  item: CanvasItem
  params: ToolParams
  /** 可作为参考图的当前画布图片；参数槽会同时读取账号资产库 */
  refChoices: CanvasItem[]
  hasMask: boolean
  onChange: (next: ToolParams) => void
  onClearMask: () => void
  onClose: () => void
  onSubmit: () => void
  unavailableReason?: string
}

/** 参数面板：贴在选中图右侧，图保持可见（涂抹、看扩图框、看调色预览）。宽 264。 */
export function ToolPanel(p: ToolPanelProps) {
  const { def, params } = p
  const ds = useV2()
  const toast = useToast()
  const hasReferenceField = Boolean(def.fields?.some((field) => field.kind === 'ref'))
  const assetReferences = useLoad(async (source) => {
    if (!hasReferenceField) return []
    const [products, models, materials] = await Promise.all([
      source.listProducts(), source.listModels(), source.listMaterials(),
    ])
    return toAssetReferenceChoices(products, models, materials)
  }, [def.id, hasReferenceField])
  const referenceChoices = useMemo<AssetReferenceChoice[]>(() => [
    ...(assetReferences.data ?? []),
    ...p.refChoices
      .filter((choice) => choice.id !== p.item.id && choice.image.url)
      .map((choice, index) => ({ id: `canvas:${choice.id}`, label: `画布图 ${index + 1}`, group: '画布' as const, image: choice.image })),
  ], [assetReferences.data, p.item.id, p.refChoices])
  const uploadReference = async () => {
    const [file] = await pickFiles()
    if (!file) return undefined
    try {
      const material = await ds.uploadMaterial(file)
      assetReferences.reload()
      return material.image
    } catch {
      toast('参考图上传失败，请重试')
      return undefined
    }
  }
  const set = (id: string, v: ToolParams[string]) => p.onChange({ ...params, [id]: v })
  const countField = def.fields?.find((f) => f.count)
  const count = useMemo(() => {
    if (!countField) return 1
    const v = params[countField.id]
    if (Array.isArray(v)) return v.length
    return Number(v) || 1
  }, [params, countField])
  const missing = (def.fields ?? []).filter((f) => !f.optional && f.kind !== 'slider' && f.kind !== 'segment' && f.kind !== 'chips' && f.kind !== 'select')
    .some((f) => (f.kind === 'text' ? !String(params[f.id] ?? '').trim() : !params[f.id]))
  const needMask = def.overlay === 'mask' && !p.hasMask
  const multiEmpty = countField?.multi && count === 0
  const outpaint = def.id === 'outpaint'
  const ratioField = def.fields?.find(field => field.id === 'ratio')
  const supportedRatios = ratioField?.options ?? []
  const currentRatio = String(params.ratio ?? ratioField?.default ?? '')
  const [ratioWidth, ratioHeight] = currentRatio.split(':').map(Number)
  const noExpansion = outpaint && ratioWidth * p.item.image.height === ratioHeight * p.item.image.width
  const disabled = noExpansion || missing || needMask || Boolean(multiEmpty) || Boolean(p.unavailableReason)
  const cost = def.cost === undefined ? undefined : def.cost * Math.max(1, count)

  return (
    <div className={'tpn nodrag nopan nowheel' + (outpaint ? ' tpn-outpaint' : '')} onPointerDown={(e) => e.stopPropagation()}>
      <div className="tpn-hd">
        <Icon name={def.icon} size={15} />
        <b>{outpaint ? '扩图改比例' : def.name}</b>
        <button className="tpn-x" title="关闭（Esc）" onClick={p.onClose}><Icon name="x" size={14} /></button>
      </div>
      {!outpaint && def.tip && <p className="tpn-tip">{def.tip}</p>}
      {p.unavailableReason && <p className="tpn-tip" role="status">{p.unavailableReason}</p>}
      <div className="tpn-bd">
        {outpaint && <>
          <label className="outpaint-scale">缩放比例
            <select aria-label="缩放比例" defaultValue="1">
              <option value="1">1x</option>
              <option value="1.5" disabled>1.5x · 待接入</option>
              <option value="2" disabled>2x · 待接入</option>
            </select>
          </label>
          <label className="outpaint-preset">预设<select defaultValue="general"><option value="general">通用</option></select></label>
          <fieldset className="outpaint-ratios">
            <legend className="sr-only">目标比例</legend>
            {['original', '1:1', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9', '4:5', '5:4'].map(ratio => {
              const selected = currentRatio === ratio
              const enabled = supportedRatios.some(option => option.id === ratio)
              const [w, h] = ratio.split(':').map(Number)
              const scale = 14 / Math.max(w, h)
              return <label key={ratio} className="outpaint-ratio">
                <input type="radio" name={`outpaint-ratio-${p.item.id}`} checked={selected} disabled={!enabled} onChange={() => set('ratio', ratio)} />
                <span className="outpaint-mark" aria-hidden="true">{selected && <Icon name="check" size={14} />}</span>
                <span className="outpaint-shape" aria-hidden="true">{ratio === 'original' ? <Icon name="fit" size={15} /> : <i style={{ width: w * scale, height: h * scale }} />}</span>
                <span>{ratio === 'original' ? '原始比例' : ratio}</span>
                {!enabled && <small>待接入</small>}
              </label>
            })}
          </fieldset>
        </>}
        {(def.fields ?? []).filter(field => !outpaint || field.id !== 'ratio').map((f) => (
          <ToolFieldControl key={f.id} f={f} value={params[f.id]} onChange={(v) => set(f.id, v)} refChoices={referenceChoices} onUploadReference={uploadReference} />
        ))}
        {def.overlay === 'mask' && (
          <div className="tpn-mask">
            <span>{p.hasMask ? '已涂抹' : '在图上按住拖动涂抹'}</span>
            {p.hasMask && <button onClick={p.onClearMask}>清除</button>}
          </div>
        )}
      </div>
      <div className="tpn-ft">
        {def.editor ? (
          <>
            <button className="tpn-ghost" onClick={p.onClose}>取消</button>
            <button className="tpn-go" disabled={disabled} onClick={p.onSubmit}>{p.unavailableReason ? '即将上线' : '另存为新图'}</button>
          </>
        ) : outpaint ? (
          <>
            <button type="button" className="tpn-ghost" onClick={p.onClose}>取消</button>
            <button type="button" className="tpn-go" disabled={disabled} onClick={p.onSubmit}>{noExpansion ? '请选择不同的比例' : `生成${count > 1 ? ` · ${count} 张` : ''}`}{V2_DISPLAY.showCreditPrices && <em><Icon name="zap" size={11} />{cost ?? '—'}</em>}</button>
          </>
        ) : (
          <button className="tpn-go wide" disabled={disabled} onClick={p.onSubmit}>
            {needMask ? '先涂抹要处理的区域' : missing ? '还差必填项' : multiEmpty ? '至少选一个' : <>生成{count > 1 ? ` · ${count} 张` : ''}{V2_DISPLAY.showCreditPrices && <em><Icon name="zap" size={11} />{cost ?? '—'}</em>}</>}
          </button>
        )}
      </div>
    </div>
  )
}

export function ToolFieldControl({ f, value, onChange, refChoices, onUploadReference }: {
  f: ToolField
  value: ToolParams[string]
  onChange: (v: ToolParams[string]) => void
  refChoices: AssetReferenceChoice[]
  onUploadReference: () => Promise<ImageRef | undefined>
}) {
  const labelId = useId()
  const label = (
    <div className="tpn-lb" id={labelId}>
      {f.label}
      {f.optional && <small>可选</small>}
      {f.kind === 'slider' && <small className="num">{Number(value ?? f.default ?? 0)}</small>}
      {f.multi && Array.isArray(value) && <small className="num">已选 {value.length}</small>}
    </div>
  )
  if (f.kind === 'segment') {
    return (
      <div className="tpn-f">{label}
        <div className="tpn-seg">
          {f.options!.map((o) => <button key={o.id} className={value === o.id ? 'on' : undefined} onClick={() => onChange(o.id)}>{o.label}</button>)}
        </div>
      </div>
    )
  }
  if (f.kind === 'chips') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div className="tpn-f">{label}
        <div className="chips">
          {f.options!.map((o) => {
            const on = f.multi ? arr.includes(o.id) : value === o.id
            return (
              <button key={o.id} className={'chip sm' + (on ? ' on' : '')}
                onClick={() => onChange(f.multi ? (on ? arr.filter((x) => x !== o.id) : [...arr, o.id]) : o.id)}>
                {f.multi && on && <Icon name="check" size={10} />}{o.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (f.kind === 'select') return <div className="tpn-f">{label}<Select f={f} value={value} onChange={onChange} /></div>
  if (f.kind === 'slider') {
    return (
      <div className="tpn-f">{label}
        <input aria-labelledby={labelId} className="tpn-range" type="range" min={f.min} max={f.max} value={Number(value ?? f.default ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    )
  }
  if (f.kind === 'text') {
    return (
      <div className="tpn-f">{label}
        <textarea aria-labelledby={labelId} className="tpn-ta" rows={2} placeholder={f.placeholder} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }
  // ref：参考图槽同时展示账号资产库与当前画布，并支持上传后立即选中。
  return <div className="tpn-f">{label}<RefSlot value={value as ImageRef | undefined} onChange={onChange} choices={refChoices} onUpload={onUploadReference} /></div>
}

function Select({ f, value, onChange }: { f: ToolField; value: ToolParams[string]; onChange: (v: ToolParams[string]) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', h, true)
    return () => document.removeEventListener('pointerdown', h, true)
  }, [open])
  const opts = f.options!
  const searchable = opts.length > 10
  const arr = Array.isArray(value) ? value : []
  const shown = searchable && q ? opts.filter((o) => o.label.includes(q)) : opts
  const text = f.multi
    ? (arr.length ? opts.filter((o) => arr.includes(o.id)).map((o) => o.label).join('、') : '请选择')
    : opts.find((o) => o.id === value)?.label ?? '请选择'
  return (
    <div className="tpn-sel" ref={ref}>
      <button className={'tpn-sel-btn' + (open ? ' on' : '')} onClick={() => setOpen(!open)}><span>{text}</span><Icon name="chev" size={11} /></button>
      {open && (
        <div className="tpn-sel-pop">
          {searchable && (
            <div className="tpn-sel-q"><Icon name="search" size={12} /><input autoFocus placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          )}
          {f.multi && (
            <div className="tpn-sel-acts">
              <button onClick={() => onChange(opts.map((o) => o.id))}>全选</button>
              <button onClick={() => onChange([])}>清空</button>
            </div>
          )}
          <div className="tpn-sel-list">
            {shown.map((o) => {
              const on = f.multi ? arr.includes(o.id) : value === o.id
              return (
                <button key={o.id} className={'mi' + (on ? ' on' : '')}
                  onClick={() => { if (f.multi) onChange(on ? arr.filter((x) => x !== o.id) : [...arr, o.id]); else { onChange(o.id); setOpen(false) } }}>
                  {f.multi && <i className={'cb' + (on ? ' on' : '')}>{on && <Icon name="check" size={9} />}</i>}
                  {o.label}{!f.multi && on && <Icon name="check" size={12} />}
                </button>
              )
            })}
            {!shown.length && <div className="tpn-empty">没有匹配的</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function RefSlot({ value, onChange, choices, onUpload }: {
  value?: ImageRef
  onChange: (v: ImageRef | undefined) => void
  choices: AssetReferenceChoice[]
  onUpload: () => Promise<ImageRef | undefined>
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  if (value) {
    return (
      <div className="tpn-ref has">
        <img src={value.thumbUrl ?? value.url} alt="" />
        <button className="tpn-ref-x" title="移除" onClick={() => onChange(undefined)}><Icon name="x" size={11} /></button>
      </div>
    )
  }
  return (
    <div className="tpn-refwrap">
      <button className={'tpn-ref' + (open ? ' on' : '')} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={14} /><span>从资产或画布选择</span>
      </button>
      {open && (
        <div className="tpn-refgrid">
          {choices.slice(0, 12).map((choice) => (
            <button key={choice.id} title={`${choice.group} · ${choice.label}`} onClick={() => { onChange(choice.image); setOpen(false) }}>
              <img src={choice.image.thumbUrl ?? choice.image.url} alt={choice.label} />
            </button>
          ))}
          <button className="up" disabled={uploading} onClick={async () => {
            setUploading(true)
            try {
              const image = await onUpload()
              if (image) { onChange(image); setOpen(false) }
            } finally { setUploading(false) }
          }} title="上传参考图"><Icon name="upload" size={14} /></button>
        </div>
      )}
    </div>
  )
}
