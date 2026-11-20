import { z } from 'zod'

const point = z.number().finite().min(-100000).max(100000)
const entityId = z.string().min(1).max(240).regex(/^flow-(image|task|outfit|shooting|annotation|group):[a-zA-Z0-9_-]+$/)
const imageEntityId = z.string().min(1).max(240).regex(/^flow-image:[a-zA-Z0-9_-]+$/)
const groupEntityId = z.string().min(1).max(240).regex(/^flow-group:[a-zA-Z0-9_-]+$/)
export const canvasPlacementSchema = z.object({
  id: entityId, x: point, y: point,
  width: z.number().finite().min(32).max(4000),
  height: z.number().finite().min(32).max(4000),
}).strict()
export const canvasNoteSchema = z.object({
  id: z.string().max(240).regex(/^flow-annotation:[a-zA-Z0-9_-]+$/),
  text: z.string().max(2000), x: point, y: point,
}).strict()
export const canvasGroupSchema = z.object({
  id: groupEntityId,
  label: z.string().trim().min(1).max(80),
  nodeIds: z.array(imageEntityId).min(2).max(200).refine(ids => new Set(ids).size === ids.length, '分组成员不能重复'),
}).strict()
export const canvasPatchSchema = z.object({
  arrangement: z.literal('creative-v1').optional(),
  placements: z.array(canvasPlacementSchema).max(400).optional(),
  noteUpserts: z.array(canvasNoteSchema).max(50).optional(),
  noteDeletes: z.array(canvasNoteSchema.shape.id).max(50).optional(),
  groupUpserts: z.array(canvasGroupSchema).max(50).optional(),
  groupDeletes: z.array(groupEntityId).max(50).optional(),
}).strict()
export const canvasPresentationSchema = z.object({
  arrangement: z.literal('creative-v1').optional(),
  placements: z.array(canvasPlacementSchema).max(400),
  notes: z.array(canvasNoteSchema).max(50),
  groups: z.array(canvasGroupSchema).max(50).optional(),
}).strict()
export type CanvasPlacement = z.infer<typeof canvasPlacementSchema>
export type CanvasNote = z.infer<typeof canvasNoteSchema>
export type CanvasGroup = z.infer<typeof canvasGroupSchema>
export type CanvasPatch = z.infer<typeof canvasPatchSchema>
export type CanvasPresentation = z.infer<typeof canvasPresentationSchema>

/** 只有展示信息；不存图片 URL、素材关系或任何执行授权。 */
export function applyCanvasPatch(current: CanvasPresentation | undefined, patch: CanvasPatch, allowed: ReadonlySet<string>): CanvasPresentation {
  const notes = new Map((current?.notes ?? []).map(note => [note.id, note]))
  for (const id of patch.noteDeletes ?? []) notes.delete(id)
  for (const note of patch.noteUpserts ?? []) notes.set(note.id, { ...note })
  if (notes.size > 50) throw new Error('画布最多保留 50 条批注')
  const groups = new Map<string, CanvasGroup>()
  for (const group of current?.groups ?? []) {
    const nodeIds = group.nodeIds.filter(id => allowed.has(id))
    if (nodeIds.length >= 2) groups.set(group.id, { ...group, nodeIds })
  }
  for (const id of patch.groupDeletes ?? []) groups.delete(id)
  for (const group of patch.groupUpserts ?? []) {
    if (group.nodeIds.some(id => !allowed.has(id))) throw new Error('分组成员不属于当前会话')
    groups.set(group.id, { ...group, nodeIds: [...group.nodeIds] })
  }
  if (groups.size > 50) throw new Error('画布最多保留 50 个分组')
  const permitted = new Set([...allowed, ...notes.keys(), ...groups.keys()])
  const placements = new Map((current?.placements ?? []).filter(item => permitted.has(item.id)).map(item => [item.id, item]))
  for (const item of patch.placements ?? []) {
    if (!permitted.has(item.id)) throw new Error('画布元素不属于当前会话')
    placements.set(item.id, { ...item })
    const note = notes.get(item.id)
    if (note) notes.set(item.id, { ...note, x: item.x, y: item.y })
  }
  for (const id of patch.noteDeletes ?? []) placements.delete(id)
  if (placements.size > 400) throw new Error('画布布局数量超出上限')
  return {
    ...((patch.arrangement ?? current?.arrangement) ? { arrangement: patch.arrangement ?? current?.arrangement } : {}),
    placements: [...placements.values()],
    notes: [...notes.values()],
    ...(groups.size ? { groups: [...groups.values()] } : {}),
  }
}

export function canvasEntityIds(session: {
  nodes: Array<{ id: string }>
  messages: Array<{ plan?: { task?: { taskId: string } }; outfitBoards?: Array<{ id: string }> }>
  shootings?: Array<{ id: string }>
  canvas?: CanvasPresentation
}): Set<string> {
  const allowed = new Set([
    ...session.nodes.map(node => `flow-image:${node.id}`),
    ...session.messages.flatMap(message => [
      ...(message.plan?.task ? [`flow-task:${message.plan.task.taskId}`] : []),
      ...(message.outfitBoards ?? []).map(board => `flow-outfit:${board.id}`),
    ]),
    ...(session.shootings ?? []).map(shooting => `flow-shooting:${shooting.id}`),
  ])
  for (const group of session.canvas?.groups ?? []) {
    if (group.nodeIds.length >= 2 && group.nodeIds.every(id => allowed.has(id))) allowed.add(group.id)
  }
  return allowed
}
