export const PENDING_KEY = (projectId: string) => `v2:pending:${projectId}`
export function readPendingDraft(projectId: string): string | null {
  try { return sessionStorage.getItem(PENDING_KEY(projectId)) } catch { return null }
}

/** Only queued drafts may be automatically sent. A claimed/unknown POST is never retried. */
export interface SendReadiness { project: boolean; channel: boolean; busy: boolean; active: boolean; error?: string }
export const PENDING_READY_TIMEOUT = 30_000
export interface PendingMessage<T> {
  draft: T
  deadline: number
  status: 'queued' | 'sending' | 'sent' | 'failed'
  error?: string
}
export function canSendMessage(ready: SendReadiness): boolean {
  return ready.project && ready.channel && !ready.busy && !ready.active && !ready.error
}
export function pendingMessage<T>(draft: T, now: number): PendingMessage<T> {
  return { draft, deadline: now + PENDING_READY_TIMEOUT, status: 'queued' }
}
export function advancePending<T>(state: PendingMessage<T>, ready: SendReadiness, now: number, outcome?: 'sent' | 'failed'):
  { state: PendingMessage<T>; action: 'wait' | 'send' | 'fail' } {
  if (state.status === 'sent' || state.status === 'failed') return { state, action: 'wait' }
  if (state.status === 'sending' && outcome === 'sent') return { state: { ...state, status: 'sent' }, action: 'wait' }
  if ((state.status === 'sending' && outcome === 'failed') ||
      (state.status === 'queued' && (ready.error || now >= state.deadline))) {
    return { state: { ...state, status: 'failed', error: '未发送，已保留草稿' + (ready.error ? '：' + ready.error : '') }, action: 'fail' }
  }
  if (state.status === 'queued' && canSendMessage(ready)) return { state: { ...state, status: 'sending' }, action: 'send' }
  return { state, action: 'wait' }
}
