'use client'
import React, { useRef, useState } from 'react'
import type { PiImagePlanCommand, PiImagePlanView } from '@/lib/agent-pi/image-plan'
import { Icon } from '../icons'
import { useToast } from '../ui'

const STATUS_TEXT: Record<PiImagePlanView['status'], string> = {
  draft: '待确认',
  confirmed: '已确认执行',
  cancelled: '已取消',
  superseded: '已更新',
}

export function PlanCard({
  plan,
  onReview, choices = [],
}: {
  plan: PiImagePlanView
  choices?: { label: string; image: PiImagePlanView['references'][number]['image'] }[]
  onReview?: (command: PiImagePlanCommand) => Promise<void>
}) {
  const toast = useToast()
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState<'save' | 'confirm' | 'cancel' | null>(null)
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState(plan.prompt)
  const [refs, setRefs] = useState(plan.references)

  const specialist = plan.specialist
  const [options, setOptions] = useState(specialist?.options ?? {})
  const images = new Map([...choices.map(({ image, label }) => ({ assetId: image.id, image, label })), ...plan.references].map(ref => [ref.assetId, ref]))
  const isDraft = plan.status === 'draft'
  const count = specialist?.toolId === 80253 ? `${specialist.options.frames} 帧 · ${specialist.options.frameMs} ms · GIF + 帧图集`
    : `${plan.generation.count} ${specialist?.toolId === 80232 ? '屏' : '张'}`
  const spec = `${plan.generation.ratio === 'more' ? '原图比例' : plan.generation.ratio} · ${plan.generation.resolution.toUpperCase()} · ${count}`
  const invalidRoles = specialist?.roles.some(role => refs.filter(ref => ref.role === role.key).length < role.min)
  const limit = specialist?.toolId === 80253 ? 300 : specialist?.toolId === 80232 ? 200 : specialist ? 1500 : 8000
  const shown = editing ? refs : plan.references

  const submit = async (command: PiImagePlanCommand) => {
    if (!onReview || lock.current) return
    lock.current = true
    setSubmitting(command.action)
    try {
      await onReview(command)
      if (command.action === 'save') {
        setEditing(false)
        toast('方案已保存，确认后开始生成')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '方案操作失败，请刷新查看最新状态')
    } finally {
      lock.current = false
      setSubmitting(null)
    }
  }

  return (
    <div className={'plan-card status-' + plan.status} role="region" aria-label={`生图方案：${plan.title}`}>
      <div className="plan-card-hd">
        <span className="plan-card-ico"><Icon name="sparkles" size={13} /></span>
        <b>{plan.title}</b>
        <span className="plan-card-spec tnum">{spec}</span>
        <em className={'plan-card-badge st-' + plan.status}>{STATUS_TEXT[plan.status]}</em>
      </div>

      {shown.length > 0 && !(editing && specialist) && (
        <div className="plan-card-refs" aria-label="方案参考图">
          {shown.map(ref => (
            <span key={ref.assetId} className="plan-card-ref" title={ref.label}>
              <img src={ref.image.url} alt="" />
              <span>{ref.roleLabel ? ref.roleLabel + ' · ' : ''}{ref.label}</span>
              {isDraft && editing && (
                <button
                  type="button"
                  aria-label={`移除参考图 ${ref.label}`}
                  onClick={() => setRefs(prev => prev.filter(item => item.assetId !== ref.assetId))}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isDraft && plan.unavailableReferenceCount > 0 && !editing && (
        <p className="plan-card-warn" role="status">
          有 {plan.unavailableReferenceCount} 张原参考图不可用，请点击「修改方案」保存后再确认执行。
        </p>
      )}

      {specialist?.parametersLabel && <p>{specialist.parametersLabel}</p>}
      {editing && specialist && <div className="plan-card-fields">
        {specialist.roles.map(role => {
          const assigned = refs.filter(ref => ref.role === role.key)
          const slots = assigned.length < role.max ? [...assigned, undefined] : assigned
          return slots.map((ref, i) => <label key={role.key + i}>{role.label}{role.max > 1 ? ` ${i + 1}` : ''}
            <select value={ref?.assetId ?? ''} onChange={event => {
              const next = images.get(event.target.value)
              const replacement = next ? [{ ...next, role: role.key, roleLabel: role.label }] : []
              setRefs(old => ref ? old.flatMap(item => item.assetId === ref.assetId ? replacement : [item]) : [...old, ...replacement])
            }}>
              <option value="">{i < role.min ? '请选择图片' : '可选'}</option>
              {[...images.values()].map(item => <option key={item.assetId} value={item.assetId}
                disabled={refs.some(other => other.assetId === item.assetId && other.assetId !== ref?.assetId)}>{item.label}</option>)}
            </select>
          </label>)
        })}
        {specialist.toolId === 80253 && <>
          <label>帧数<select value={options.frames} onChange={event => setOptions({ ...options, frames: Number(event.target.value) as 4 | 6 | 9 })}>
            {[4, 6, 9].map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <label>帧间隔（毫秒）<input type="number" min={100} max={500} value={Number.isFinite(options.frameMs) ? options.frameMs : ''} onChange={event => setOptions({ ...options, frameMs: event.target.valueAsNumber })} /></label>
        </>}
        {specialist.toolId === 80232 && <label>屏数<input type="number" min={1} max={10} value={Number.isFinite(options.screenCount) ? options.screenCount : ''} onChange={event => setOptions({ screenCount: event.target.valueAsNumber })} /></label>}
      </div>}

      {isDraft && editing ? (
        <textarea
          className="plan-card-editor"
          aria-label="编辑方案提示词"
          rows={4}
          value={prompt}
          maxLength={limit}
          onChange={event => setPrompt(event.target.value)}
        />
      ) : (
        <p className="plan-card-prompt">{plan.prompt}</p>
      )}

      {isDraft && onReview && (
        <div className="plan-card-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="btn pri"
                disabled={Boolean(submitting) || !prompt.trim() || prompt.trim().length > limit || invalidRoles
                  || (specialist?.toolId === 80253 && !(Number.isInteger(options.frameMs) && options.frameMs! >= 100 && options.frameMs! <= 500))
                  || (specialist?.toolId === 80232 && !(Number.isInteger(options.screenCount) && options.screenCount! >= 1 && options.screenCount! <= 10))}
                onClick={() => void submit({
                  action: 'save',
                  runId: plan.runId,
                  revision: plan.revision,
                  prompt: prompt.trim(),
                  referenceAssetIds: refs.map(item => item.assetId),
                  ...(specialist ? { options, referenceRoles: refs.map(item => item.role!) } : {}),
                })}
              >
                {submitting === 'save' ? '保存中…' : '保存修改'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={Boolean(submitting)}
                onClick={() => { setPrompt(plan.prompt); setRefs(plan.references); setOptions(specialist?.options ?? {}); setEditing(false) }}
              >
                放弃修改
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn pri"
                disabled={Boolean(submitting) || plan.unavailableReferenceCount > 0}
                onClick={() => void submit({ action: 'confirm', runId: plan.runId, revision: plan.revision })}
              >
                {submitting === 'confirm' ? '提交中…' : '确认执行'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={Boolean(submitting)}
                onClick={() => setEditing(true)}
              >
                修改方案
              </button>
              <button
                type="button"
                className="btn"
                disabled={Boolean(submitting)}
                onClick={() => void submit({ action: 'cancel', runId: plan.runId, revision: plan.revision })}
              >
                {submitting === 'cancel' ? '取消中…' : '取消'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
