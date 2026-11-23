'use client'
import { lazyComponent } from '@/lib/lazy-component'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CanvasItem, Project } from '@/lib/v2/types'
import { Icon } from '../icons'

const ExportSettingsDialog = lazyComponent(() => import('./export-settings-dialog').then(m => m.ExportSettingsDialog))

export interface ExportDialogProps { project: Project; items: CanvasItem[]; selected: string[]; compact?: boolean }
/** 使用画布当前 V2DataSource 状态，mock/API 共用，不再请求另一份项目数据。 */
export function ExportDialog(props: ExportDialogProps) {
  const [open, setOpen] = useState(false)
  const host = typeof document !== 'undefined' ? document.querySelector('.v2') : null
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="导出" title="导出" aria-haspopup="dialog"><Icon name="dl" size={props.compact ? 18 : 14} />{!props.compact && '导出'}</button>
    {open && host && createPortal(<ExportSettingsDialog key={props.project.id} {...props} onClose={() => setOpen(false)} />, host)}
  </>
}
