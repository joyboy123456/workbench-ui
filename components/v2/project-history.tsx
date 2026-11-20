'use client'
import * as Popover from '@radix-ui/react-popover'
import Link from 'next/link'
import React, { useEffect, useId, useRef, useState } from 'react'
import type { Project } from '@/lib/v2/types'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { Icon } from './icons'
import { useToast } from './ui'

export function groupProjects(projects: Project[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return [
    { label: '今日', projects: projects.filter(project => new Date(project.updatedAt).getTime() >= today) },
    { label: '更久以前', projects: projects.filter(project => !(new Date(project.updatedAt).getTime() >= today)) },
  ]
}

/** Shared native dialog: safe initial focus for deletion, explicit submit and failure feedback. */
export function ProjectActionDialog({ project, action, onSubmit, onClose }: {
  project: Project; action: 'rename' | 'delete'; onSubmit: (name: string) => Promise<void>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const first = useRef<HTMLInputElement | null>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()
  const lock = useRef(false)
  const [name, setName] = useState(project.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const control = action === 'delete' ? cancel.current : first.current
    if (control) control.autofocus = true
    dialog.current?.showModal()
    first.current?.select()
  }, [action])
  return <dialog ref={dialog} className="nav-dialog" aria-labelledby={id} onClose={onClose} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={async event => {
      event.preventDefault()
      if (lock.current || (action === 'rename' && !name.trim())) return
      lock.current = true; setBusy(true); setError('')
      try { await onSubmit(name.trim()); dialog.current?.close() }
      catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败，请重试') }
      finally { lock.current = false; setBusy(false) }
    }}>
      <h2 id={id}>{action === 'rename' ? '重命名项目' : '删除项目？'}</h2>
      {action === 'rename' ? <label>项目名称<input ref={first} aria-label="项目名称" value={name} maxLength={120} required onChange={event => setName(event.target.value)} /></label>
        : <p>确认删除「{project.name}」？项目画布与对话将被移除，此操作无法撤销。</p>}
      {error && <p role="alert">{error}</p>}
      <footer><button ref={cancel} type="button" className="btn" onClick={() => dialog.current?.close()}>取消</button>
        <button type="submit" className="btn pri" disabled={busy || (action === 'rename' && !name.trim())}>{busy ? '处理中…' : action === 'rename' ? '保存' : '确认删除'}</button></footer>
    </form>
  </dialog>
}

export function ProjectHistory({ currentId, onRenamed, onChanged, onCurrentDeleted }: { currentId?: string; onRenamed?: (id: string, name: string) => void; onChanged?: () => void; onCurrentDeleted?: () => void }) {
  const ds = useV2()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<{ project: Project; kind: 'rename' | 'delete' } | null>(null)
  const { data, loading, error, reload } = useLoad(source => source.listProjects(), [open], open)
  const host = typeof document !== 'undefined' ? document.querySelector('.v2') : null
  return <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild><button type="button" className="ibtn nav-history-trigger" aria-label="历史" title="历史 · 我的项目库"><Icon name="hist" size={16} /></button></Popover.Trigger>
      <Popover.Portal container={host}><Popover.Content className="nav-history" sideOffset={8} align="start" collisionPadding={12} aria-label="我的项目库">
        <h2>我的项目库</h2>
        {loading && <p role="status">正在读取项目…</p>}
        {error && <p role="alert">{error}<button type="button" onClick={reload}>重试</button></p>}
        {!loading && !error && !data?.length && <p>还没有项目</p>}
        {!error && groupProjects(data ?? []).map(group => group.projects.length > 0 && <section key={group.label} aria-label={group.label}>
          <h3>{group.label}</h3>
          {group.projects.map(project => <div key={project.id} className="nav-history-row">
            <Link href={`/v2/canvas/${project.id}?view=split`} onClick={() => setOpen(false)} aria-current={currentId === project.id ? 'page' : undefined} title={project.name}>{project.name}</Link>
            <button type="button" className="ibtn" aria-label={`重命名 ${project.name}`} title="重命名" onClick={() => setAction({ project, kind: 'rename' })}><Icon name="edit" size={14} /></button>
            <button type="button" className="ibtn" aria-label={`删除 ${project.name}`} title="删除" onClick={() => setAction({ project, kind: 'delete' })}><Icon name="trash" size={14} /></button>
          </div>)}
        </section>)}
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {action && <ProjectActionDialog project={action.project} action={action.kind} onClose={() => setAction(null)} onSubmit={async name => {
      if (action.kind === 'rename') {
        await ds.renameProject(action.project.id, name)
        onRenamed?.(action.project.id, name)
        toast('项目已重命名')
      } else {
        await ds.deleteProject(action.project.id)
        toast('项目已删除')
        if (currentId === action.project.id) onCurrentDeleted?.()
      }
      reload()
      onChanged?.()
    }} />}
  </>
}

export function CollapsedProjectMenu({ project, onRenamed, onNewProject, creating }: {
  project: Project; onRenamed: (name: string) => void; onNewProject: () => void; creating: boolean
}) {
  const ds = useV2()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const host = typeof document !== 'undefined' ? document.querySelector('.v2') : null
  return <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild><button type="button" className="nav-project-title" title={project.name} aria-label="项目菜单"><span>{project.name}</span><Icon name="chev" size={12} /></button></Popover.Trigger>
      <Popover.Portal container={host}><Popover.Content className="menu nav-project-menu" align="start" sideOffset={8} collisionPadding={12}>
        <button type="button" className="mi" onClick={() => { setOpen(false); setRenaming(true) }}><Icon name="edit" />重命名</button>
        <button type="button" className="mi" disabled={creating} onClick={() => { setOpen(false); onNewProject() }}><Icon name="plus" />新建项目</button>
        <Link className="mi" href="/v2"><Icon name="home" />回到首页</Link>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {renaming && <ProjectActionDialog project={project} action="rename" onClose={() => setRenaming(false)} onSubmit={async name => { await ds.renameProject(project.id, name); onRenamed(name) }} />}
  </>
}
