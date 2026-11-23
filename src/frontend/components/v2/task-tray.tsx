'use client'
import { lazyComponent } from '@/lib/lazy-component'
import React, { useEffect, useRef, useState } from 'react'
import { useV2 } from '@/lib/v2/data-source'
import type { ActiveTask } from '@/lib/v2/types'
import { Icon } from './icons'
import { useDismiss } from './ui'
import { useV2Auth } from './auth'

const TaskTrayPanel = lazyComponent(() => import('./task-tray-panel').then(m => m.TaskTrayPanel))

export function TaskTray() {
  const ds = useV2()
  const { user } = useV2Auth()
  const [tasks, setTasks] = useState<ActiveTask[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss(open, () => setOpen(false), wrapRef)

  useEffect(() => {
    setTasks([])
    if (!user) return
    if (ds.subscribeTasks) {
      return ds.subscribeTasks(setTasks)
    }
    if (!ds.listActiveTasks) return
    let alive = true
    const load = () => {
      void ds.listActiveTasks?.().then((list) => {
        if (alive) setTasks(list)
      }).catch(() => { if (alive) setTasks([]) })
    }
    load()
    const timer = window.setInterval(load, 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [ds, user?.id])

  if (tasks.length === 0) return null

  return (
    <div ref={wrapRef} className="task-tray">
      {open && (
        <TaskTrayPanel tasks={tasks} onClose={() => setOpen(false)} />
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
