'use client'
import * as Popover from '@radix-ui/react-popover'
import { Link } from '@/lib/navigation'
import type { Project } from '@/lib/v2/types'
import { useLoad } from '@/lib/v2/data-source'
import { Icon } from './icons'
import { groupProjects } from './project-history'

export function ProjectHistoryPanel({ currentId, revision, onAction, onClose }: {
  currentId?: string
  revision: number
  onAction(action: { project: Project; kind: 'rename' | 'delete' }): void
  onClose(): void
}) {
  const { data, loading, error, reload } = useLoad(source => source.listProjects(), [revision])
  const host = typeof document !== 'undefined' ? document.querySelector('.v2') : null
  return (
    <Popover.Portal container={host}><Popover.Content className="nav-history" sideOffset={8} align="start" collisionPadding={12} aria-label="我的项目库">
      <h2>我的项目库</h2>
      {loading && <p role="status">正在读取项目…</p>}
      {error && <p role="alert">{error}<button type="button" onClick={reload}>重试</button></p>}
      {!loading && !error && !data?.length && <p>还没有项目</p>}
      {!error && groupProjects(data ?? []).map(group => group.projects.length > 0 && <section key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        {group.projects.map(project => <div key={project.id} className="nav-history-row">
          <Link href={`/v2/canvas/${project.id}?view=split`} onClick={onClose} aria-current={currentId === project.id ? 'page' : undefined} title={project.name}>{project.name}</Link>
          <button type="button" className="ibtn" aria-label={`重命名 ${project.name}`} title="重命名" onClick={() => onAction({ project, kind: 'rename' })}><Icon name="edit" size={14} /></button>
          <button type="button" className="ibtn" aria-label={`删除 ${project.name}`} title="删除" onClick={() => onAction({ project, kind: 'delete' })}><Icon name="trash" size={14} /></button>
        </div>)}
      </section>)}
    </Popover.Content></Popover.Portal>
  )
}
