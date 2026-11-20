'use client'
import * as Popover from '@radix-ui/react-popover'
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { toAssetReferenceChoices } from '@/lib/v2/asset-choices'
import { BATCH_LIMIT, eligibleBatchTools, planBatch, runBatch, type BatchProgress } from '@/lib/v2/batch-run'
import { missingToolFields } from '@/lib/v2/composer-input'
import { useLoad, useV2, type AgentEvent } from '@/lib/v2/data-source'
import { usableImage } from '@/lib/v2/selection-actions'
import type { CanvasItem, ToolDef, ToolParams } from '@/lib/v2/types'
import { Icon } from '../icons'
import { pickFiles, useToast } from '../ui'
import { defaultParams, ToolFieldControl } from './tool-panel'

interface BatchContextValue {
  items: CanvasItem[]
  tools: ToolDef[]
  busy: boolean
  run: (items: CanvasItem[], toolId: string, params: ToolParams) => void
}
const BatchContext = createContext<BatchContextValue | null>(null)

export interface BatchProviderProps {
  projectId: string
  items: CanvasItem[]
  tools: ToolDef[]
  /** Flush the existing canvas save, including unsaved source images. */
  prepare: () => Promise<void>
  onEvent: (event: AgentEvent) => void
  onRunningChange?: (running: boolean) => void
  children: ReactNode
}

/** Mount around Board, outside the selection's lifetime. Deselecting must not
 * stop a batch, lose its status, or drop its late result events. */
export function BatchProvider(props: BatchProviderProps) {
  const ds = useV2()
  const toast = useToast()
  const current = useRef(props)
  current.current = props
  const active = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [props.projectId])

  const run = (selected: CanvasItem[], toolId: string, params: ToolParams) => {
    if (active.current) return
    const snapshot = current.current
    const ids = new Set(selected.map(item => item.id))
    const sources = snapshot.items.filter(item => ids.has(item.id))
    if (!eligibleBatchTools(snapshot.tools, sources).some(tool => tool.id === toolId.split(':')[0])) {
      toast('该工具当前不可批量处理，请重新选择'); return
    }
    let plan: ReturnType<typeof planBatch>
    try { plan = planBatch(sources, toolId, params) }
    catch (error) { toast(error instanceof Error ? error.message : '无法创建批量任务'); return }
    const controller = new AbortController()
    active.current = controller
    setBusy(true); setProgress(null)
    snapshot.onRunningChange?.(true)
    void (async () => {
      try {
        await snapshot.prepare()
        if (controller.signal.aborted) return
        await runBatch(ds, snapshot.projectId, plan, event => {
          if (controller.signal.aborted || current.current.projectId !== snapshot.projectId) return
          if (event.type === 'batch-progress') setProgress(event.progress)
          else current.current.onEvent(event)
        }, { signal: controller.signal })
      } catch (error) {
        if (!controller.signal.aborted) toast(error instanceof Error ? error.message : '批量处理未能开始，请重试')
      } finally {
        if (active.current === controller) {
          active.current = null
          setBusy(false)
          current.current.onRunningChange?.(false)
        }
      }
    })()
  }
  return <BatchContext.Provider value={{ items: props.items, tools: props.tools, busy, run }}>
    {props.children}
    <BatchProgressToast progress={progress} busy={busy} onClose={() => setProgress(null)} />
  </BatchContext.Provider>
}

function BatchProgressToast({ progress, busy, onClose }: { progress: BatchProgress | null; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = progress !== null
  useEffect(() => {
    const element = ref.current
    // Native top layer is an enhancement; older browsers retain the fixed toast.
    if (!element || !visible || typeof element.showPopover !== 'function') return
    element.setAttribute('popover', 'manual')
    element.showPopover()
    return () => {
      if (element.isConnected && element.matches(':popover-open')) element.hidePopover()
      element.removeAttribute('popover')
    }
  }, [visible])
  return <div ref={ref} className="h1-batch-toast nodrag nopan" hidden={!visible} role="region" aria-label="批量处理进度">
    <div role="status" aria-live="polite" aria-atomic="true">
      {progress && <>
        <strong>已提交 {progress.submitted} · 完成 {progress.completed} · 失败 {progress.failed}</strong>
        <span>{busy ? `${progress.active} 张处理中 · ${progress.queued} 张排队` : '本批处理结束'}{progress.unconfirmed ? ` · ${progress.unconfirmed} 张待确认，请查询原任务` : ''}</span>
      </>}
    </div>
    {!!progress?.failed && <p>失败图片可在对应结果上单独重试；提交异常请先查看任务提示。</p>}
    {!busy && <button type="button" onClick={onClose} aria-label="关闭批量进度"><Icon name="x" size={14} /></button>}
  </div>
}

/** Kept inside SelectionToolbar; the Radix portal isolates field keyboard
 * interaction from its roving toolbar focus and stays inside the V2 theme. */
export function BatchAction({ items, toolId, label }: { items: CanvasItem[]; toolId?: string; label?: string }) {
  const batch = useContext(BatchContext)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  const ready = items.filter(usableImage)
  const reason = !batch ? '批量处理暂未接线' : ready.length > BATCH_LIMIT ? `一次最多 ${BATCH_LIMIT} 张`
    : !ready.length ? '请选择已完成的图片' : batch.busy ? '当前批次正在处理' : ''
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" disabled={Boolean(reason)} title={reason || '为所选图片统一设置工具参数'} aria-describedby={reason ? `${id}-reason` : undefined}>
        <Icon name={toolId === 'upscale' ? 'up' : 'grid'} size={15} /><span className="selection-label">{label ?? '批量处理'}</span><Icon name="chev" size={10} />
      </button>
    </Popover.Trigger>
    {reason && <span id={`${id}-reason`} className="h1-batch-reason">{reason}</span>}
    <Popover.Portal container={trigger.current?.closest('.v2') ?? undefined}>
      <Popover.Content className="h1-batch-pop nodrag nopan nowheel" aria-label="批量处理" side="bottom" align="start" sideOffset={8} collisionPadding={12}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }) }}>
        {batch && <BatchPanel items={items} canvasItems={batch.items} tools={batch.tools} busy={batch.busy} initialToolId={toolId}
          onClose={() => setOpen(false)} onRun={(toolId, params) => { batch.run(items, toolId, params); setOpen(false) }} />}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
}

const initialParams = (tool: ToolDef): ToolParams => ({ ...defaultParams(tool), __batchOption: tool.options?.[0]?.id })

export function BatchPanel({ items, canvasItems, tools, busy, onRun, onClose, initialToolId }: {
  items: CanvasItem[]
  canvasItems: CanvasItem[]
  tools: ToolDef[]
  busy: boolean
  onRun: (toolId: string, params: ToolParams) => void
  onClose: () => void
  initialToolId?: string
}) {
  const ds = useV2()
  const toast = useToast()
  const id = useId()
  const ready = items.filter(usableImage)
  const available = eligibleBatchTools(tools, items)
  const [selection, setSelection] = useState<{ id: string; params: ToolParams } | null>(() => {
    const initial = available.find(tool => tool.id === initialToolId)
    return initial ? { id: initial.id, params: initialParams(initial) } : null
  })
  const def = available.find(tool => tool.id === selection?.id) ?? available[0]
  const params = def ? selection?.id === def.id ? selection.params : initialParams(def) : {}
  const needsReferences = Boolean(def?.fields?.some(field => field.kind === 'ref'))
  const references = useLoad(async source => {
    if (!needsReferences) return []
    const [products, models, materials] = await Promise.all([source.listProducts(), source.listModels(), source.listMaterials()])
    return toAssetReferenceChoices(products, models, materials)
  }, [needsReferences])
  const choices = useMemo(() => [
    ...(references.data ?? []),
    ...canvasItems.filter(item => usableImage(item) && !items.some(selected => selected.id === item.id))
      .map((item, index) => ({ id: `canvas:${item.id}`, label: `画布图 ${index + 1}`, group: '画布' as const, image: item.image })),
  ], [references.data, canvasItems, items])
  const uploadReference = async () => {
    const [file] = await pickFiles('image/*', false)
    if (!file) return
    try {
      const material = await ds.uploadMaterial(file)
      references.reload()
      return material.image
    } catch { toast('参考图上传失败，请重试'); return undefined }
  }
  const missing = def ? missingToolFields(def, params) : []
  const reason = ready.length > BATCH_LIMIT ? `一次最多 ${BATCH_LIMIT} 张` : !ready.length ? '请选择已完成的图片'
    : !def ? '当前没有可批量处理的工具' : busy ? '当前批次正在处理' : missing.length ? `请填写：${missing.join('、')}` : ''
  const change = (fieldId: string, value: ToolParams[string]) => { if (def) setSelection({ id: def.id, params: { ...params, [fieldId]: value } }) }
  return <div className="h1-batch-panel">
    <div className="h1-batch-heading"><b>批量处理</b><button type="button" onClick={onClose} aria-label="关闭批量处理"><Icon name="x" size={14} /></button></div>
    <p className="h1-batch-note">统一参数，逐张执行 · {ready.length} 张可处理{items.length > ready.length ? ` · 已排除 ${items.length - ready.length} 张未完成图片` : ''}</p>
    <div className="h1-batch-fields">
      <label htmlFor={`${id}-tool`}>处理工具</label>
      <select id={`${id}-tool`} name="batch-tool" value={def?.id ?? ''} disabled={!available.length || busy}
        onChange={event => { const tool = available.find(value => value.id === event.target.value); if (tool) setSelection({ id: tool.id, params: initialParams(tool) }) }}>
        {!available.length && <option value="">暂无可批量处理的工具</option>}
        {available.map(tool => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
      </select>
      <div className="h1-batch-parameters" role="group" aria-label="工具参数">
        <b>工具参数</b>
        {def?.options?.length ? <ToolFieldControl f={{ id: '__batchOption', label: '处理规格', kind: 'segment', options: def.options }} value={params.__batchOption}
          onChange={value => change('__batchOption', value)} refChoices={[]} onUploadReference={uploadReference} /> : null}
        {def?.fields?.map(field => <ToolFieldControl key={`${def.id}:${field.id}`} f={field} value={params[field.id]}
          onChange={value => change(field.id, value)} refChoices={choices} onUploadReference={uploadReference} />)}
        {!def && <p className="h1-batch-note">工具目录为空，请稍后重新打开。</p>}
        {def && !def.fields?.length && !def.options?.length && <p className="h1-batch-note">无需额外参数，将逐张处理。</p>}
        {needsReferences && <p className="h1-batch-note">{references.loading ? '正在读取参考素材…' : references.error ? '参考素材暂时无法读取，可使用画布图或上传。' : choices.length ? '参考图将用于本批所有图片。' : '暂无参考素材，可上传一张参考图。'}{references.error && <button type="button" onClick={references.reload}>重新读取</button>}</p>}
      </div>
    </div>
    <div className="h1-batch-footer">
      <p id={`${id}-hint`} className="h1-batch-note">{reason || '每张结果放在各自源图右侧，失败互不影响。'}</p>
      <button type="button" className="tpn-go wide" disabled={Boolean(reason)} aria-describedby={`${id}-hint`} onClick={() => {
        if (!def || reason) return
        const { __batchOption, ...submitted } = params
        onRun(def.options?.length && typeof __batchOption === 'string' ? `${def.id}:${__batchOption}` : def.id, submitted)
      }}>对 {ready.length} 张执行</button>
    </div>
  </div>
}
