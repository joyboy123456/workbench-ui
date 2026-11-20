import { placeResults } from './arrange'
import type { AgentEvent } from './data-source'
import { mergeGenerationItem } from './generation-progress'
import type { CurtainPatch } from './project-schema'
import { snapshotKey } from './snapshot-key'
import type { CanvasItem } from './types'

export interface CurtainSyncOptions {
  send(patch: CurtainPatch, items: CanvasItem[]): Promise<void>
  debounceMs?: number
  onError?(error: unknown): void
  onPendingRemovalsChange?(ids: string[]): void
}

export interface CurtainSync {
  reset(items: readonly CanvasItem[]): void
  sync(items: readonly CanvasItem[]): void
  flush(): Promise<void>
  isRemoved(itemId: string): boolean
  dispose(): Promise<void>
}

function durableSignature(item: CanvasItem): string {
  if (item.status !== 'running') return snapshotKey(item)
  return snapshotKey({ ...item, progress: undefined, generationPhase: undefined, startedAt: undefined })
}

function computePatch(
  baselineOrder: readonly string[],
  baselineMap: ReadonlyMap<string, string>,
  current: readonly CanvasItem[],
  pendingRemovals: ReadonlySet<string>,
): CurtainPatch | null {
  const currentIds = new Set(current.map(item => item.id))
  const removeIds = [...pendingRemovals]
  const upsert = current.filter(item => baselineMap.get(item.id) !== durableSignature(item))
  const simulated = baselineOrder.filter(id => currentIds.has(id))
  for (const item of upsert) if (!baselineMap.has(item.id)) simulated.push(item.id)
  const targetOrder = current.map(item => item.id)
  const orderChanged = simulated.length !== targetOrder.length
    || simulated.some((id, index) => id !== targetOrder[index])
  if (!upsert.length && !removeIds.length && !orderChanged) return null
  return {
    ...(upsert.length ? { upsert: structuredClone(upsert) } : {}),
    ...(removeIds.length ? { removeIds } : {}),
    ...(orderChanged ? { orderIds: targetOrder } : {}),
  }
}

export function createCurtainSync(options: CurtainSyncOptions): CurtainSync {
  const debounceMs = options.debounceMs ?? 120
  let baselineOrder: string[] = []
  let baselineMap = new Map<string, string>()
  let latest: CanvasItem[] = []
  let knownIds = new Set<string>()
  const removedIds = new Set<string>()
  const pendingRemovals = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<void> = Promise.resolve()
  let closing: Promise<void> | undefined

  const publishPendingRemovals = () => options.onPendingRemovalsChange?.([...pendingRemovals])

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const commitBaseline = (items: readonly CanvasItem[]) => {
    baselineOrder = items.map(item => item.id)
    baselineMap = new Map(items.map(item => [item.id, durableSignature(item)]))
  }

  const pushNow = (): Promise<void> => {
    clearTimer()
    const run = async () => {
      for (;;) {
        const snapshot = latest
        const patch = computePatch(baselineOrder, baselineMap, snapshot, pendingRemovals)
        if (!patch) return
        await options.send(patch, snapshot)
        commitBaseline(snapshot)
        if (patch.removeIds?.length) {
          for (const id of patch.removeIds) pendingRemovals.delete(id)
          publishPendingRemovals()
        }
        // If latest did not advance further during send, we are caught up.
        if (latest === snapshot) return
      }
    }
    const next = queue.catch(() => undefined).then(run)
    queue = next.catch(error => { options.onError?.(error) })
    return next
  }

  return {
    reset(items) {
      clearTimer()
      const cloned = structuredClone(items) as CanvasItem[]
      latest = cloned
      commitBaseline(cloned)
      knownIds = new Set(cloned.map(item => item.id))
      removedIds.clear()
      pendingRemovals.clear()
    },
    sync(items) {
      if (closing) return
      const nextIds = new Set(items.map(item => item.id))
      let removalsChanged = false
      for (const id of knownIds) {
        if (nextIds.has(id)) continue
        // A generation result can already exist on the server when first shown locally.
        removedIds.add(id)
        pendingRemovals.add(id)
        removalsChanged = true
      }
      for (const id of nextIds) {
        removedIds.delete(id)
        if (pendingRemovals.delete(id)) removalsChanged = true
      }
      if (removalsChanged) publishPendingRemovals()
      knownIds = nextIds
      latest = structuredClone(items) as CanvasItem[]
      clearTimer()
      if (!computePatch(baselineOrder, baselineMap, latest, pendingRemovals)) return
      timer = setTimeout(() => {
        timer = undefined
        void pushNow().catch(() => undefined)
      }, debounceMs)
    },
    flush() {
      return closing ?? pushNow()
    },
    isRemoved(itemId) {
      return removedIds.has(itemId)
    },
    dispose() {
      return closing ??= pushNow()
    },
  }
}

export function applyCanvasAgentEvent(
  items: CanvasItem[],
  event: Extract<AgentEvent, { type: 'item-add' | 'item-update' }>,
  options: { isRemoved?(id: string): boolean; anchorId?: string } = {},
): { items: CanvasItem[]; addedNew: boolean } {
  if (event.type === 'item-add') {
    if (options.isRemoved?.(event.item.id)) return { items, addedNew: false }
    if (items.some(item => item.id === event.item.id)) {
      return {
        items: items.map(item => item.id === event.item.id
          ? mergeGenerationItem(item, {
            ...event.item,
            x: item.x,
            y: item.y,
            w: item.w,
            ...(item.locked !== undefined ? { locked: item.locked } : {}),
          })
          : item),
        addedNew: false,
      }
    }
    const [placed] = placeResults(items, [event.item], options.anchorId)
    return { items: [...items, placed], addedNew: true }
  }
  if (options.isRemoved?.(event.id) || !items.some(item => item.id === event.id)) {
    return { items, addedNew: false }
  }
  return {
    items: items.map(item => item.id === event.id ? mergeGenerationItem(item, event.patch) : item),
    addedNew: false,
  }
}
