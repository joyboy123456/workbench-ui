'use client'
import React, { useEffect, useState } from 'react'
import type { PiRunDetails } from '@/lib/agent-pi/run-details'

const kinds = { model: '模型调用', skill: '技能', tool: '工具', submission: '提交', confirmation: '确认', admission: '准入核对', turn: '轮次' }
const labels: Record<string, string> = {
  completed: '完成', failed: '失败', partial: '部分成功', success: '成功', returned: '已返回', error: '模型失败', aborted: '已中止',
  stopped: '已停止', cancelled: '已取消', blocked: '等待处理', preloaded: '已预读', read: '已读取', reference: '已读取资料',
  toolUse: '已选择工具', stop: '正常结束', length: '达到输出上限', submitted: '已提交', already_submitted: '沿用原提交',
  pending: '待执行', running: '执行中', unknown: '待核实', unconfirmed: '结果未确认', rejected: '未受理',
  needs_input: '需要补充信息', interrupted: '已中断', STARTING: '受理中', SUBMITTED: '已受理', NOT_STARTED: '未提交',
  UNKNOWN: '提交待核实', NOT_APPLICABLE: '尚无可准入结果', PENDING: '待核对', QUARANTINED: '已隔离', ADMITTED: '已准入',
}
const reasons: Record<string, string> = {
  task_params_mismatch: '执行参数与冻结请求不符', task_input_mismatch: '输入素材与冻结请求不符', task_feature_mismatch: '任务类型不符',
  task_output_mismatch: '产物数量或顺序不符', gif_output_mismatch: 'GIF 和帧图集未通过核对', detail_screen_mismatch: '详情页屏位不符',
  generation_unconfirmed: '生成结果未确认', generation_failed: '部分或全部生成明确失败', task_delivery_failed: '部分或全部结果未交付',
  queue_full: '生成队列已满', plan_changed: '方案执行规格已变化',
}
const status = (code: string) => labels[code] ?? code
const duration = (ms: number) => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} 秒`
const elapsed = (begin?: string, end?: string) => begin && end && Date.parse(end) >= Date.parse(begin) ? duration(Date.parse(end) - Date.parse(begin)) : undefined
const time = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour12: false, fractionalSecondDigits: 3, hour: '2-digit', minute: '2-digit', second: '2-digit' })
const explanation = (codes: string[]) => codes.map(code => reasons[code] ?? code).join('、')

type ReadRunDetails = (projectId: string, runId: string, signal: AbortSignal) => Promise<PiRunDetails>

export function RunDetails({ projectId, runId, readDetails }: { projectId: string; runId: string; readDetails?: ReadRunDetails }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(runId)
  const [refresh, setRefresh] = useState(0)
  const [read, setRead] = useState<{ target: string; refresh: number; details?: PiRunDetails }>()
  const current = read?.target === target && read.refresh === refresh ? read : undefined
  useEffect(() => {
    if (!open || !readDetails) return
    const abort = new AbortController()
    readDetails(projectId, target, abort.signal)
      .then(details => { if (!abort.signal.aborted) setRead({ target, refresh, details }) })
      .catch(() => { if (!abort.signal.aborted) setRead({ target, refresh }) })
    return () => abort.abort()
  }, [open, projectId, target, refresh, readDetails])
  const details = current?.details
  return <details className="agent-run-details" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>运行详情</summary>
    {open && !readDetails && <p className="agent-run-empty" role="status">演示模式暂无运行记录。</p>}
    {open && readDetails && <div className="agent-run-panel">
      <div className="agent-run-actions">
        <code>{target}</code>
        <div className="agent-run-btns">
          {target !== runId && <button type="button" onClick={() => setTarget(runId)}>回到确认轮次</button>}
          <button type="button" onClick={() => setRefresh(n => n + 1)}>刷新详情</button>
        </div>
      </div>
      {!current && <p className="agent-run-empty" role="status">正在读取运行记录…</p>}
      {current && !details && <p className="agent-run-empty" role="status">暂时无法读取运行记录。</p>}
      {details && <>
        {details.steps.length ? <ol className="agent-run-steps" aria-label="运行步骤">
          {details.steps.map((step, i) => <li key={i}>
            <div className="agent-run-step-hd">
              <time className="tnum" dateTime={step.startedAt}>{time(step.startedAt)}</time>
              <span className="agent-run-step-title">{kinds[step.kind]} · {step.label}</span>
              <small className="tnum">{status(step.status)} · {duration(step.durationMs)}</small>
            </div>
            {step.kind === 'model' && <div className="agent-run-sub tnum">{step.inputTokens === undefined || step.outputTokens === undefined
              ? '供应商未返回 token 用量' : `输入 ${step.inputTokens} token · 输出 ${step.outputTokens} token${step.cacheReadTokens ? ` · 输入含缓存命中 ${step.cacheReadTokens}` : ''}${step.cacheWriteTokens ? ` · 缓存写入 ${step.cacheWriteTokens}` : ''}`}</div>}
            {step.actionId && <div className="agent-run-sub">动作 <code>{step.actionId}</code></div>}
            {!!step.reasonCodes?.length && <div className="agent-run-reason">原因 {explanation(step.reasonCodes)}</div>}
            {step.plan && <button type="button" className="agent-run-link" onClick={() => setTarget(step.plan!.runId)}>查看方案轮次（第 {step.plan.revision} 版）</button>}
          </li>)}
        </ol> : <p className="agent-run-empty">此轮暂无逐步记录。</p>}
        {!!details.tasks.length && <ul className="agent-run-tasks" aria-label="关联任务">
          {details.tasks.map(task => <li key={task.actionId}>
            <div className="agent-run-task-hd"><strong>{task.label}</strong><span>{status(task.submission)}{task.status && ` · ${status(task.status)}`}</span></div>
            <div className="agent-run-sub tnum">{status(task.admission)} · 已准入 {task.admittedResults}/{task.expectedResults}</div>
            {task.taskId && <div className="agent-run-sub">任务 <code>{task.taskId}</code></div>}
            {task.queuedAt && <div className="agent-run-sub tnum">入队 {time(task.queuedAt)}{elapsed(task.queuedAt, task.supplierStartedAt) && ` · 排队 ${elapsed(task.queuedAt, task.supplierStartedAt)}`}</div>}
            {task.supplierStartedAt && <div className="agent-run-sub tnum">发出 {time(task.supplierStartedAt)}{elapsed(task.supplierStartedAt, task.finishedAt) && ` · 至任务结束 ${elapsed(task.supplierStartedAt, task.finishedAt)}`}</div>}
            {task.finishedAt && <div className="agent-run-sub tnum">任务结束 {time(task.finishedAt)}</div>}
            {!!task.reasonCodes.length && <div className="agent-run-reason">原因 {explanation(task.reasonCodes)}</div>}
          </li>)}
        </ul>}
      </>}
    </div>}
  </details>
}
