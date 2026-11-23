import { z } from 'zod'
import type { CanvasItem, Generation } from './types'

/** Compact mock replay snapshots reuse the existing project persistence. No
 * masks, image URLs or temporary reference objects are stored here. */
export const mockToolReplaySchema = z.object({
  id: z.string(), projectId: z.string(), toolId: z.string(), createdAt: z.string(),
  params: z.record(z.union([z.string(), z.number().finite(), z.array(z.string())])),
})
export type MockToolReplay = z.infer<typeof mockToolReplaySchema>

export function mockToolGeneration(item: CanvasItem, replay: MockToolReplay, productIds: string[]): Generation {
  const base = replay.toolId.split(':')[0]
  return {
    id: replay.id, projectId: replay.projectId, image: item.image, toolId: replay.toolId, source: 'tool',
    createdAt: replay.createdAt, params: replay.params, productIds,
    kind: base === 'detail-page' ? 'detail' : ['try-on', 'try-on-swap', 'pose', 'multi-angle'].includes(base) ? 'model' : 'edit', status: item.status ?? 'done',
    runId: item.toolRunId, toolRunId: item.toolRunId, parentId: item.parentId, parentIds: item.parentIds,
    prompt: typeof replay.params.prompt === 'string' ? replay.params.prompt : undefined,
    ratio: typeof replay.params.ratio === 'string' ? replay.params.ratio : undefined,
  }
}
