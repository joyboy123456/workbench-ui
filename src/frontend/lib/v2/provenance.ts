import type { CanvasItem, ToolParams } from './types'

/** Empty parentIds is intentional; only old snapshots fall back to parentId. */
export function parentIds(item: Pick<CanvasItem, 'id' | 'parentId' | 'parentIds'>): string[] {
  return [...new Set(item.parentIds ?? (item.parentId ? [item.parentId] : []))].filter(id => id !== item.id)
}

export function provenanceLinks(items: CanvasItem[]) {
  const ids = new Set(items.map(item => item.id))
  return items.flatMap(item => parentIds(item).filter(id => ids.has(id)).map(source => ({
    id: JSON.stringify([source, item.id]), source, target: item.id,
  })))
}

/** Breadth first layers include every reference branch, at most once per node. */
export function ancestorLayers(items: CanvasItem[], id: string): string[][] {
  const byId = new Map(items.map(item => [item.id, item]))
  const visited = new Set([id])
  let frontier = [id]
  const layers: string[][] = []
  while (frontier.length) {
    const next: string[] = []
    for (const current of frontier) {
      const item = byId.get(current)
      for (const parent of item ? parentIds(item) : []) {
        if (!byId.has(parent) || visited.has(parent)) continue
        visited.add(parent); next.push(parent)
      }
    }
    if (next.length) layers.push(next)
    frontier = next
  }
  return layers
}

/** Map reference image IDs back to this canvas only. External assets without a
 * canvas card are not fabricated as parent nodes. */
export function referenceParents(items: CanvasItem[], sourceIds: string[], params?: ToolParams): string[] {
  const imageIds = Object.values(params ?? {}).flatMap(value => value && typeof value === 'object' && !Array.isArray(value) ? [value.id] : [])
  return [...new Set([...sourceIds, ...items.filter(item => imageIds.includes(item.image.id)).map(item => item.id)])]
}

/** The all-connections toggle takes priority over a focused ancestry trace. */
export function visibleProvenanceLinks(items: CanvasItem[], showConnections: boolean, traceIds?: ReadonlySet<string>) {
  if (!showConnections && !traceIds) return []
  return provenanceLinks(items).filter(link => showConnections || !traceIds || traceIds.has(link.source) && traceIds.has(link.target))
}
