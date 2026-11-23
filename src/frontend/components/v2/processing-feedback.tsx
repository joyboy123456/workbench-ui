'use client'
import React, { useSyncExternalStore } from 'react'
import type { CanvasItem } from '@/lib/v2/types'

// All visible task cards share one clock. Only the feedback text subscribes.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let now = 0
const snapshot = () => now
const serverSnapshot = () => 0
function tick() {
  now = Date.now()
  for (const notify of listeners) notify()
}
function subscribe(notify: () => void) {
  listeners.add(notify)
  if (timer === undefined) {
    tick()
    timer = setInterval(tick, 1000)
  }
  return () => {
    listeners.delete(notify)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
      now = 0
    }
  }
}

const tips = {
  image: ['完成后可放大看细节', '可在画布中并排对比图片', '生成结果可从项目中下载'],
  video: ['完成后可预览视频', '可在画布中调整封面大小', '可从项目中下载视频'],
  text: ['结果会显示在工具面板中', '完成后可复制分析内容'],
  tool: ['可展开工具详情查看参数', '工具返回后可查看结果'],
}

type FeedbackProps = {
  startedAt?: string
  estimatedDurationMs?: number
  phase?: CanvasItem['generationPhase']
  kind?: keyof typeof tips
  roundStartedAt?: string
}

/** Mounted only for an active task. Estimates describe total processing time. */
export function ProcessingFeedback({ startedAt, estimatedDurationMs, phase, kind = 'image', roundStartedAt }: FeedbackProps) {
  const clock = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const origin = startedAt ?? roundStartedAt
  const start = origin ? Date.parse(origin) : NaN
  const seconds = clock && Number.isFinite(start) ? Math.max(0, Math.floor((clock - start) / 1000)) : undefined
  const estimate = estimatedDurationMs !== undefined && Number.isFinite(estimatedDurationMs) && estimatedDurationMs > 0 ? Math.ceil(estimatedDurationMs / 1000) : undefined
  const queued = phase === 'queued'
  const overtime = !!startedAt && !queued && seconds !== undefined && estimate !== undefined && seconds > estimate
  const hints = tips[kind]
  const rotation = seconds ?? Math.floor(clock / 1000)
  const elapsed = seconds !== undefined && (seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`)
  return <span className="processing-feedback" aria-live="off">
    {elapsed && <span className="processing-elapsed tnum" role="timer">{!startedAt ? '本轮已用' : queued ? '已等待' : '已用'} {elapsed}</span>}
    {estimate !== undefined && <span className="processing-estimate">{overtime ? '已超过预计用时' : `处理约需 ${estimate} 秒`}</span>}
    <span className="processing-tip">{hints[Math.floor(rotation / 6) % hints.length]}</span>
    <span className="processing-tip-static">{hints[0]}</span>
  </span>
}
