import type { AgentEvent, V2DataSource } from './data-source'
import { usableImage } from './selection-actions'
import type { CanvasItem, ToolDef, ToolParams } from './types'

export const BATCH_LIMIT = 20
const excluded = new Set(['inpaint', 'erase', 'describe', 'fuse', 'try-on'])

/** The current directory is authoritative, including tools with parameter panels. */
export function eligibleBatchTools(tools: readonly ToolDef[], items: readonly CanvasItem[]): ToolDef[] {
  if (!items.some(usableImage)) return []
  return tools.filter(tool => !tool.editor && tool.overlay !== 'mask' && !excluded.has(tool.id)
    && !tool.fields?.some(field => field.kind === 'ref' && !field.optional)
    && (tool.backendToolId !== undefined || tool.id === 'outpaint'))
}

export interface BatchEntry { itemId: string; toolId: string; params: ToolParams }
export type BatchOutcome = 'completed' | 'failed' | 'unconfirmed'
export interface BatchResult { itemId: string; outcome: BatchOutcome; message?: string }
export interface BatchProgress {
  total: number
  submitted: number
  completed: number
  failed: number
  unconfirmed: number
  active: number
  queued: number
  results: BatchResult[]
}
export type BatchEvent = AgentEvent | { type: 'batch-progress'; progress: BatchProgress }
export type BatchSource = Pick<V2DataSource, 'runTool' | 'watchToolRuns'>

/** toolId travels with each row so plans remain self-contained after selection changes. */
export function planBatch(items: readonly CanvasItem[], toolId: string, params: ToolParams = {}): BatchEntry[] {
  const ready = [...new Map(items.filter(usableImage).map(item => [item.id, item])).values()]
  if (ready.length > BATCH_LIMIT) throw new Error(`每批最多处理 ${BATCH_LIMIT} 张图片，请减少选择`)
  if (!ready.length) throw new Error('请选择已完成的图片')
  if (!toolId.trim() || excluded.has(toolId.split(':')[0]) || params.maskDataUrl !== undefined) {
    throw new Error('该工具不能批量处理图片')
  }
  return ready.map(item => ({ itemId: item.id, toolId, params: structuredClone(params) }))
}

/** Each worker owns one source until its outputs settle. API submission can
 * return before completion: the existing recovery stream supplies terminal states.
 * Unknown outcomes never cause a fresh submission or a fabricated success. */
export async function runBatch(
  ds: BatchSource,
  projectId: string,
  plan: readonly BatchEntry[],
  onEvent: (event: BatchEvent) => void,
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<BatchProgress> {
  if (plan.length > BATCH_LIMIT) throw new Error(`每批最多处理 ${BATCH_LIMIT} 张图片`)
  const concurrency = options.concurrency ?? 3
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('并发数必须是正整数')
  const entries = structuredClone(plan)
  const summary: BatchProgress = { total: entries.length, submitted: 0, completed: 0, failed: 0, unconfirmed: 0, active: 0, queued: entries.length, results: [] }
  const report = () => onEvent({ type: 'batch-progress', progress: structuredClone(summary) })
  type Job = {
    entry: BatchEntry
    items: Map<string, CanvasItem>
    messages: Set<string>
    returned: boolean
    error?: string
    unconfirmed: boolean
    settled: boolean
    finish: (outcome: BatchOutcome, message?: string) => void
    accept: (event: AgentEvent) => void
  }
  const jobs = new Set<Job>()
  // One recovery subscription per batch; ignore unrelated or historical tasks.
  const earlyItems = new Map<string, CanvasItem>()
  const stopWatching = plan.length && !options.signal?.aborted ? ds.watchToolRuns?.(projectId, event => {
    if (event.type === 'item-add') earlyItems.set(event.item.id, event.item)
    if (event.type === 'item-update') {
      const previous = earlyItems.get(event.id)
      if (previous) earlyItems.set(event.id, { ...previous, ...event.patch })
    }
    for (const job of jobs) {
      if (job.settled) continue
      if (event.type === 'item-add' && job.items.has(event.item.id)
        || event.type === 'item-update' && job.items.has(event.id)
        || event.type === 'message-update' && job.messages.has(event.id)) job.accept(event)
    }
  }) : undefined
  const abort = () => {
    for (const job of jobs) if (!job.settled) job.finish('unconfirmed', '已停止等待；已提交任务请在画布查询，勿重复生成')
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  let cursor = 0

  async function execute(entry: BatchEntry) {
    let release: () => void = () => {}
    const settled = new Promise<void>(resolve => { release = resolve })
    const job: Job = {
      entry, items: new Map(), messages: new Set(), returned: false, settled: false, unconfirmed: false,
      finish(outcome, message) {
        if (job.settled) return
        job.settled = true
        if (job.unconfirmed) summary.unconfirmed--
        summary.active--
        summary[outcome]++
        summary.results.push({ itemId: entry.itemId, outcome, ...(message ? { message } : {}) })
        report()
        release()
      },
      accept(event) {
        if (job.settled || options.signal?.aborted) return
        if (event.type === 'error') job.error = event.message
        if (event.type === 'message') job.messages.add(event.message.id)
        if (event.type === 'item-add') {
          const item = event.item
          const normalized = { ...item, parentId: entry.itemId, parentIds: [entry.itemId, ...(item.parentIds ?? []).filter(id => id !== entry.itemId)] }
          job.items.set(item.id, normalized)
          onEvent({ ...event, item: normalized })
          const early = earlyItems.get(item.id)
          if (early && early.status !== 'running') job.accept({ type: 'item-update', id: item.id, patch: early })
        } else {
          if (event.type === 'item-update') {
            const previous = job.items.get(event.id)
            if (previous) {
              const next = { ...previous, ...event.patch, parentId: entry.itemId,
                parentIds: [entry.itemId, ...(event.patch.parentIds ?? previous.parentIds ?? []).filter(id => id !== entry.itemId)] }
              job.items.set(event.id, next)
              // Recovery must preserve the user's current canvas coordinates.
              const { x: _x, y: _y, w: _w, locked: _locked, ...patch } = event.patch
              event = { ...event, patch: { ...patch, parentId: next.parentId, parentIds: next.parentIds } }
            }
          }
          onEvent(event)
        }
        check()
      },
    }
    function check() {
      if (!job.returned || job.settled) return
      const outputs = [...job.items.values()]
      if (outputs.length && outputs.every(item => item.status === 'done' || item.status === 'failed')) {
        const failure = outputs.find(item => item.status === 'failed')
        job.finish(failure ? 'failed' : 'completed', failure?.errorMessage)
      } else if (outputs.length && ds.watchToolRuns) {
        // UNKNOWN is an observation, not completion. Keep the same task and
        // concurrency slot until recovery supplies an authoritative outcome.
        const unconfirmed = outputs.some(item => item.generationPhase === 'unconfirmed') || Boolean(job.error)
        if (unconfirmed !== job.unconfirmed) {
          summary.unconfirmed += unconfirmed ? 1 : -1
          job.unconfirmed = unconfirmed
          report()
        }
      } else if (job.error) {
        // A known output that is still running cannot safely be called a failure.
        job.finish(outputs.length ? 'unconfirmed' : 'failed', job.error)
      } else if (!outputs.length || !ds.watchToolRuns) {
        job.finish('unconfirmed', '任务结果待确认，请查询原任务')
      }
    }
    jobs.add(job)
    summary.submitted++; summary.active++; summary.queued--
    report()
    // Do not await submission here: navigation can stop waiting even if the
    // transport is pending. Its late events are ignored, never resubmitted.
    void Promise.resolve().then(() => {
      if (!options.signal?.aborted) return ds.runTool(projectId, entry.toolId, [entry.itemId], job.accept, entry.params)
    })
      .catch((error: unknown) => { job.error = error instanceof Error ? error.message : '提交工具任务失败' })
      .finally(() => { job.returned = true; check() })
    await settled
  }

  report()
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (cursor < entries.length && !options.signal?.aborted) {
        const entry = entries[cursor++]
        await execute(entry)
      }
    }))
    return structuredClone(summary)
  } finally {
    options.signal?.removeEventListener('abort', abort)
    if (stopWatching) stopWatching()
  }
}
