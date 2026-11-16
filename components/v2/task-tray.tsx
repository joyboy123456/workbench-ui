'use client'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'
import { useV2 } from '@/lib/v2/data-source'
import type { ActiveTask } from '@/lib/v2/types'
import { Icon } from './icons'
import { useDismiss } from './ui'

const PHASE_LABEL: Record<ActiveTask['phase'], string> = {
  queued: '排队中',
  generating: '生成中',
  processing: '载入中',
  unconfirmed: '确认中',
}

export function TaskTray() {
  const ds = useV2()
  const [tasks, setTasks] = useState<ActiveTask[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss(open, () => setOpen(false), wrapRef)

  useEffect(() => {
    if (ds.subscribeTasks) {
      return ds.subscribeTasks(setTasks)
    }
    if (!ds.listActiveTasks) return
    let alive = true
    const load = () => {
      void ds.listActiveTasks?.().then((list) => {
        if (alive) setTasks(list)
      })
    }
    load()
    const timer = window.setInterval(load, 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [ds])

  if (tasks.length === 0) return null

  return (
    <div ref={wrapRef} className="task-tray">
      {open && (
        <div className="task-tray-pop" role="dialog" aria-label="生成中任务列表">
          <div className="task-tray-head">
            <b>生成任务</b>
            <span className="tnum">{tasks.length} 个进行中</span>
            <button type="button" className="ibtn" aria-label="收起任务列表" onClick={() => setOpen(false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="task-tray-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-tray-item">
                <div className="task-tray-thumb">
                  {task.thumbUrl ? <img src={task.thumbUrl} alt="" /> : <Icon name="img" size={16} />}
                </div>
                <div className="task-tray-info">
                  <div className="task-tray-title">
                    <span>{task.title}</span>
                    <small className="tnum">{task.progress}%</small>
                  </div>
                  <div className="task-tray-bar">
                    <i style={{ width: `${Math.max(4, Math.min(100, task.progress))}%` }} />
                  </div>
                  <div className="task-tray-meta">
                    <span className="task-tray-phase">{PHASE_LABEL[task.phase]}</span>
                    <Link
                      href={`/v2/canvas/${encodeURIComponent(task.projectId)}?view=split`}
                      className="task-tray-link"
                      onClick={() => setOpen(false)}
                    >
                      {task.projectName}
                      <Icon name="right" size={11} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={'task-tray-pill' + (open ? ' on' : '')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="pulse-dot" aria-hidden />
        <span className="tnum">{tasks.length} 个生成中</span>
        <Icon name="chev" size={13} className={'task-tray-caret' + (open ? ' open' : '')} />
      </button>
    </div>
  )
}
