'use client'
import { useEffect, useId, useState } from 'react'
import { useV2 } from '@/lib/v2/data-source'
import { regeneratePlan, regenerationNotice, regenerationRecord, type RegenerationPlan } from '@/lib/v2/regenerate'
import { regenerationToolInput } from '@/lib/v2/regenerate-run'
import type { CanvasItem, ChatMessage, Generation, ToolDef, ToolParams } from '@/lib/v2/types'
import { Icon } from '../icons'

export interface RegenerationActionsProps {
  item: CanvasItem
  items: CanvasItem[]
  messages: ChatMessage[]
  tools: ToolDef[]
  submitting?: boolean
  onClose: () => void
  onRun: (toolId: string, sourceIds: string[], params: ToolParams, anchorId: string) => void
  onEditTool: (toolId: string, sourceId: string, params: ToolParams, anchorId: string, notice?: string) => void
  onEditChat: (plan: Extract<RegenerationPlan, { kind: 'chat' }>) => void
}

/** Shared by the node context menu and the selection toolbar's More menu. */
export function RegenerationActions(p: RegenerationActionsProps) {
  const ds = useV2()
  const noticeId = useId()
  const [record, setRecord] = useState<{ id: string; generation?: Generation; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    const id = p.item.ref.id
    void ds.getGeneration(id).then(detail => {
      if (!cancelled) setRecord({ id, generation: detail?.generation })
    }).catch(() => { if (!cancelled) setRecord({ id, error: '读取生成记录失败，请重试' }) })
    return () => { cancelled = true }
  }, [ds, p.item.ref.id, attempt])
  const current = record?.id === p.item.ref.id ? record : null
  const plan = regeneratePlan(p.item, p.items, regenerationRecord(p.item, p.messages, current?.generation))
  const tool = plan.kind === 'tool' ? p.tools.find(tool => tool.id === plan.toolId.split(':')[0]) : undefined
  const input = plan.kind === 'tool' && tool ? regenerationToolInput(plan, tool) : undefined
  const missingSource = plan.kind === 'unavailable' && plan.reason === '来源图片已删除'
  const reason = missingSource ? plan.reason : !current ? '读取原参数…' : current.error ?? (plan.kind === 'unavailable' ? plan.reason
    : plan.kind === 'tool' && (!tool || tool.editor) ? '原工具当前不可用' : undefined)
  const notice = reason ?? [regenerationNotice(plan), input?.reason].filter(Boolean).join('；')
  const disabled = Boolean(reason || p.submitting)
  const edit = () => {
    if (disabled) return
    p.onClose()
    if (plan.kind === 'tool') p.onEditTool(plan.toolId, plan.sourceIds[0], plan.params, p.item.id, notice || undefined)
    else if (plan.kind === 'chat') p.onEditChat(plan)
  }
  return (
    <>
      <div className="gt">继续创作</div>
      <button type="button" role="menuitem" className="mi" disabled={disabled} aria-describedby={notice ? noticeId : undefined}
        title={notice} onClick={() => {
          if (disabled) return
          if (plan.kind !== 'tool' || input?.needsEdit) { edit(); return }
          p.onClose()
          p.onRun(plan.toolId, plan.sourceIds, input?.params ?? plan.params, p.item.id)
        }}><Icon name="redo" />重新生成{input?.needsEdit && <small>需确认</small>}{plan.kind === 'chat' && <small>带回输入框</small>}</button>
      <button type="button" role="menuitem" className="mi" disabled={disabled} aria-describedby={notice ? noticeId : undefined} title={notice} onClick={edit}><Icon name="tune" />改参数再生成</button>
      {notice && <p className="regeneration-notice" id={noticeId} role="status">{notice}</p>}
      {current?.error && <button type="button" role="menuitem" className="mi" onClick={() => { setRecord(null); setAttempt(value => value + 1) }}><Icon name="redo" />重新读取参数</button>}
      <div className="sep" role="separator" />
    </>
  )
}
