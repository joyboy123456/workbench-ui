// State/protocol updates happen synchronously. Only publication of accumulated text is deferred.
export function createTextFrame(
  request = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : undefined,
  cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : undefined,
) {
  let frame: number | undefined
  const pending = new Set<() => void>()
  function clear() {
    if (frame !== undefined) cancel?.(frame)
    frame = undefined
  }
  function flush() {
    clear()
    const callbacks = [...pending]
    pending.clear()
    for (const callback of callbacks) callback()
  }
  return {
    enqueue(publish: () => void) {
      if (!request) { publish(); return }
      pending.add(publish)
      frame ??= request(flush)
    },
    flush,
    cancel() { clear(); pending.clear() },
  }
}
