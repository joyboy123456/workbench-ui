// Snapshots stay referentially stable between writes for useSyncExternalStore.
export function createValueStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach(notify => notify())
    },
  }
}
