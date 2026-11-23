import { createCanvasHistory } from '@/lib/v2/canvas-history'
import { createValueStore } from '@/lib/v2/value-store'
import { usableImage } from '@/lib/v2/selection-actions'
import type { ChatMessage, ImageRef } from '@/lib/v2/types'

export function createCanvasGraphStore() {
  const history = createCanvasHistory()
  const live = createValueStore(history.items)
  const committed = createValueStore(history.items)
  const selection = createValueStore<string[]>([])
  const images = createValueStore<{ id: string; label: string; image: ImageRef }[]>([])
  const generations = createValueStore<string[]>([])
  function updateGenerations() {
    const selected = new Set(selection.getSnapshot())
    const next = history.items.filter(i => selected.has(i.id) && i.ref.type === 'generation').map(i => i.ref.id)
    const old = generations.getSnapshot()
    if (next.length !== old.length || next.some((id, i) => id !== old[i])) generations.set(next)
  }
  return {
    images, generations, history, live, committed, selection,
    select(ids: string[]) {
      const current = selection.getSnapshot()
      if (ids.length !== current.length || ids.some((id, i) => id !== current[i])) { selection.set(ids); updateGenerations() }
    },
    publish(commit: boolean) {
      live.set(history.items)
      if (!commit) return
      const next = history.items.filter(usableImage)
      const old = images.getSnapshot()
      if (next.length !== old.length || next.some((item, i) => old[i].id !== item.id || old[i].image !== item.image)) {
        images.set(next.map((item, i) => ({ id: item.id, label: `图 ${i + 1}`, image: item.image })))
      }
      updateGenerations()
      committed.set(history.items)
    },
  }
}

export function createChatStreamStore() {
  const messages = createValueStore<ChatMessage[]>([])
  // Reference resolution needs message order and user attachments, never assistant text deltas.
  const referenceTimeline = createValueStore<ChatMessage[]>([])
  function set(next: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) {
    const before = messages.getSnapshot()
    const after = typeof next === 'function' ? next(before) : next
    if (before === after) return
    messages.set(after)
    if (after.length !== before.length || after.some((m, i) =>
      m.id !== before[i].id || m.role !== before[i].role || (m.role === 'user' && m !== before[i]))) {
      referenceTimeline.set(after)
    }
  }
  return { messages, referenceTimeline, set }
}
