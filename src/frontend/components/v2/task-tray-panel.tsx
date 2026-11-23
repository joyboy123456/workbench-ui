'use client'
import { Link } from '@/lib/navigation'
import type { ActiveTask } from '@/lib/v2/types'
import { Icon } from './icons'

const PHASE_LABEL: Record<ActiveTask['phase'], string> = {
  queued: '排队中',
  generating: '生成中',
  processing: '载入中',
  unconfirmed: '确认中',
}

export function TaskTrayPanel({ tasks, onClose }: { tasks: ActiveTask[]; onClose(): void }) {
  return (
    <div className="task-tray-pop" role="dialog" aria-label="生成中任务列表">
      <div className="task-tray-head">
        <b>生成任务</b>
        <span className="tnum">{tasks.length} 个进行中</span>
        <button type="button" className="ibtn" aria-label="收起任务列表" onClick={onClose}>
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
              </div>
              <div className="task-tray-meta">
                <span className="task-tray-phase">{PHASE_LABEL[task.phase]}</span>
                <Link
                  prefetch={false}
                  href={`/v2/canvas/${encodeURIComponent(task.projectId)}?view=split`}
                  className="task-tray-link"
                  onClick={onClose}
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
  )
}
