import type { GenerationQuery } from './data-source'
import type { Generation, ToolDef, ToolParams } from './types'

export interface GenerationPage { generations: Generation[]; total: number }
export interface GenerationDetail { generation: Generation; siblings: Generation[] }
export const GENERATION_KINDS = { main: '主图', detail: '详情页', model: '模特图', banner: 'Banner', video: '视频', edit: '编辑' } as const

export function filterGenerations(records: Generation[], q: GenerationQuery = {}): GenerationPage {
  const search = q.search?.trim().toLocaleLowerCase()
  const list = records.filter(g => (!q.kind || g.kind === q.kind) && (!q.projectId || g.projectId === q.projectId)
    && (!q.productId || g.productIds.includes(q.productId)) && (!q.toolId || g.toolId === q.toolId || g.toolId?.split(':')[0] === q.toolId)
    && (!q.favorite || g.favorite) && (!search || `${g.prompt ?? ''} ${g.toolId ?? ''} ${GENERATION_KINDS[g.kind]}`.toLocaleLowerCase().includes(search)))
    .sort((a, b) => (q.sort === 'oldest' ? 1 : -1) * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)))
  return { generations: list.slice(q.offset ?? 0, q.limit === undefined ? undefined : (q.offset ?? 0) + q.limit), total: list.length }
}

export function generationDetail(records: Generation[], id: string): GenerationDetail | null {
  const generation = records.find(g => g.id === id)
  if (!generation) return null
  // Without a recorded run/task, do not infer a batch from nearby timestamps.
  const group = generation.runId ?? generation.taskId
  const siblings = group ? records.filter(g => g.projectId === generation.projectId && (g.runId ?? g.taskId) === group) : [generation]
  return { generation, siblings: siblings.sort((a, b) => a.id.localeCompare(b.id)) }
}

export function groupGenerationDays(records: Generation[], now = new Date()) {
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const groups = new Map<string, { date: string; label: string; records: Generation[] }>()
  for (const record of records) {
    const date = key(new Date(record.createdAt))
    if (!groups.has(date)) groups.set(date, { date, label: date === key(now) ? '今天' : date === key(yesterday) ? '昨天' : date, records: [] })
    groups.get(date)!.records.push(record)
  }
  return [...groups.values()]
}

/** Only fields which can safely be prefilled; masks and transient image URLs never survive. */
export function replayParameters(params: Record<string, unknown>) {
  const result: Record<string, string | number | string[]> = {}
  const keys = ['prompt', 'ratio', 'n', 'screens', 'scene', 'poses', 'angles', 'color', 'mode', 'style', 'strength', 'factor',
    // 椒图对齐的扩图参数（imageSize/model/feathering/referenceAssetIds/scale/position）随运行记录冻结，可回放。
    'imageSize', 'model', 'feathering', 'referenceAssetIds', 'scale', 'positionX', 'positionY']
  for (const key of keys) {
    const value = params[key]
    if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value) && value.every(v => typeof v === 'string')) result[key] = value
  }
  return result
}

/** Old records can belong to a different tool version. Only prefill fields the current panel supports. */
export function generationToolParameters(tool: ToolDef, recorded: ToolParams = {}): ToolParams {
  const safe = replayParameters(recorded)
  return Object.fromEntries((tool.fields ?? []).map(field => [field.id, safe[field.id] ?? field.default]))
}
