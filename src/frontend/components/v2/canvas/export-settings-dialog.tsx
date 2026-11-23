'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { ExportDialogProps } from './export-dialog'
import type { CanvasItem } from '@/lib/v2/types'
import { usableImage } from '@/lib/v2/selection-actions'
import { createExportDownload, MAX_EXPORT_FILES, type ExportFormat, type ExportOptions } from '@/lib/v2/export-archive'
import type { ExportSizeMode } from '@/lib/v2/export-plan'
import { Icon } from '../icons'

export function ExportSettingsDialog({ project, items, selected, onClose }: ExportDialogProps & { onClose(): void }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const initialControl = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null)
  const alive = useRef(true)
  const selectedIds = new Set(selected)
  const ready = items.filter(usableImage)
  const selectedReady = ready.filter(item => selectedIds.has(item.id))
  const [scope, setScope] = useState<'selected' | 'all'>(selectedReady.length ? 'selected' : 'all')
  const [format, setFormat] = useState<ExportFormat>('png')
  const [size, setSize] = useState<ExportSizeMode>('original')
  const [busy, setBusy] = useState(false)
  const [frozenSources, setFrozenSources] = useState<CanvasItem[] | null>(null)
  const [done, setDone] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    alive.current = true
    const element = dialog.current
    if (initialControl.current) initialControl.current.autofocus = true
    if (element && !element.open) element.showModal()
    return () => { alive.current = false; operation.current?.abort() }
  }, [])

  const sources = frozenSources ?? (scope === 'selected' ? selectedReady : ready)
  const rangeError = sources.length > MAX_EXPORT_FILES ? '每次最多导出 100 张图片，请减少选择数量' : ''
  const change = () => { setError(''); setFeedback('') }
  const close = () => { operation.current?.abort(); dialog.current?.close() }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operation.current || rangeError || !sources.length) return
    const controller = new AbortController()
    operation.current = controller
    setFrozenSources(sources.map(item => ({ ...item, image: { ...item.image } })))
    setBusy(true); setDone(0); setError(''); setFeedback('')
    const options: ExportOptions = { projectName: project.name, size, format }
    try {
      const download = await createExportDownload(sources.map(item => item.image), options, controller.signal, count => { if (alive.current) setDone(count) })
      if (!alive.current || controller.signal.aborted) return
      const url = URL.createObjectURL(download.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = download.name
      document.body.appendChild(link)
      try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000) }
      setFeedback(sources.length === 1 ? '图片下载已开始' : `已打包 ${sources.length} 个文件，ZIP 下载已开始`)
    } catch (failure) {
      if (alive.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : '导出失败，请重试')
      else if (alive.current) setFeedback('已取消导出')
    } finally {
      operation.current = null
      if (alive.current) { setBusy(false); setFrozenSources(null) }
    }
  }

  return <dialog ref={dialog} className="h2-export-dialog" aria-labelledby={`${id}-title`} onCancel={() => operation.current?.abort()} onClose={() => { operation.current?.abort(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={submit} onChange={change}>
      <header className="h2-export-header">
        <h2 id={`${id}-title`}>导出图片</h2>
        <button type="button" className="h2-export-close" onClick={close} aria-label="关闭导出弹窗"><Icon name="x" size={18} /></button>
      </header>
      <div className="h2-export-body">
        <fieldset className="h2-export-group" disabled={busy}><legend>导出范围</legend><div className="h2-export-options">
          <label className="h2-export-choice"><input ref={selectedReady.length ? initialControl : undefined} type="radio" name={`${id}-scope`} value="selected" checked={scope === 'selected'} disabled={!selectedReady.length} onChange={() => setScope('selected')} /><span>选中 {selectedReady.length} 张</span></label>
          <label className="h2-export-choice"><input ref={!selectedReady.length ? initialControl : undefined} type="radio" name={`${id}-scope`} value="all" checked={scope === 'all'} onChange={() => setScope('all')} /><span>全部 {ready.length} 张</span></label>
        </div><p className="h2-export-hint">单次最多导出 100 张</p></fieldset>
        <fieldset className="h2-export-group" disabled={busy}><legend>文件格式</legend><div className="h2-export-options">
          {(['png', 'jpg', 'webp', 'svg'] as const).map(value => <label key={value} className="h2-export-choice"><input type="radio" name={`${id}-format`} value={value} checked={format === value} onChange={() => setFormat(value)} /><span>{value === 'jpg' ? 'JPEG' : value === 'svg' ? 'SVG（嵌入原图）' : value.toUpperCase()}</span></label>)}
          <label className="h2-export-choice" title="当前不支持 PSD 分层编码"><input type="radio" disabled /><span>PSD</span></label>
          <label className="h2-export-choice" title="当前图片为位图，无法直接导出矢量路径"><input type="radio" disabled /><span>SVG（矢量）</span></label>
        </div><p className="h2-export-hint">SVG 嵌入图片，保留图像效果；矢量路径与 PSD 分层导出暂不支持。</p></fieldset>
        <fieldset className="h2-export-group" disabled={busy}><legend>尺寸</legend><div className="h2-export-options">
          {([{ value: 'original', label: '原图' }, { value: '2k', label: '2K' }, { value: '1k', label: '1K' }] satisfies { value: ExportSizeMode; label: string }[]).map(mode => <label key={mode.value} className="h2-export-choice"><input type="radio" name={`${id}-size`} value={mode.value} checked={size === mode.value} onChange={() => setSize(mode.value)} /><span>{mode.label}</span></label>)}
        </div></fieldset>
      </div>
      <footer className="h2-export-footer">
        <p className="h2-export-summary" role="status" aria-atomic="true">{busy ? `正在处理 ${done}/${sources.length}` : feedback}</p>
        {(rangeError || error) && <p className="h2-export-error" role="alert"><Icon name="alert" size={15} />{error || rangeError}</p>}
        <button type="submit" className="h2-export-primary" disabled={busy || !sources.length || Boolean(rangeError)}><Icon name="dl" size={16} />{busy ? '正在处理…' : sources.length <= 1 ? '下载' : `导出 ZIP（${sources.length} 张）`}</button>
      </footer>
    </form>
  </dialog>
}
