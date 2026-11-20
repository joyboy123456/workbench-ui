import { placeResults } from './arrange'
import { generationToolParameters } from './generation-history'
import type { AgentEvent } from './data-source'
import type { CanvasItem, ToolDef, ToolParams } from './types'
import type { RegenerationPlan } from './regenerate'

/** G2 deliberately did not retain masks or reference slots. These need an
 * explicit edit rather than a request with silently different inputs. */
export function regenerationToolInput(plan: Extract<RegenerationPlan, { kind: 'tool' }>, tool: ToolDef): {
  params: ToolParams; needsEdit: boolean; reason?: string
} {
  const params = generationToolParameters(tool, plan.params)
  if (tool.overlay === 'mask') return { params, needsEdit: true, reason: '请重新涂抹要处理的区域' }
  if (plan.sourceIds.length > 1 && tool.id !== 'fuse') return { params, needsEdit: true, reason: '请重新确认参考图片' }
  if (tool.fields?.some(field => field.kind === 'ref' && !field.optional)) return { params, needsEdit: true, reason: '请重新选择参考图片' }
  return { params, needsEdit: false }
}

/** Placement is a local canvas concern. Never turn the original result into a
 * source, or rewrite server-projected parentIds to imply unused references. */
export function regenerationEvents(anchorId: string, readItems: () => CanvasItem[], receive: (event: AgentEvent) => void,
  place?: (item: CanvasItem) => void): (event: AgentEvent) => void {
  const placedIds = new Set<string>()
  return event => {
    if (event.type !== 'item-add' || placedIds.has(event.item.id)) { receive(event); return }
    placedIds.add(event.item.id)
    const [item] = placeResults(readItems().filter(item => item.id !== event.item.id), [event.item], anchorId)
    receive({ ...event, item })
    // A watcher may have observed this ID before the submission response. The
    // normal upsert preserves layout; explicitly place this first response once.
    place?.(item)
  }
}
