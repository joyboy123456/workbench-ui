import type { CanvasItem } from './types'

export type CanvasUpdate = CanvasItem[] | ((items: CanvasItem[]) => CanvasItem[])
const sameItems = (a: CanvasItem[], b: CanvasItem[]) => a.length === b.length && a.every((item, index) => item === b[index])

/** 现有画布撤销栈的手势边界。远端事件同步所有快照，撤销只回退用户编辑。 */
export function createCanvasHistory(initial: CanvasItem[] = []) {
  let current = initial
  let past: CanvasItem[][] = []
  let future: CanvasItem[][] = []
  let gesture: CanvasItem[] | null = null
  const history = {
    get items() { return current },
    get counts() { return { past: past.length, future: future.length } },
    reset(items: CanvasItem[]) { current = items; past = []; future = []; gesture = null },
    beginMove() { gesture ??= current },
    endMove() { if (gesture) history.update(current) },
    update(next: CanvasUpdate, commit = true) {
      const value = typeof next === 'function' ? next(current) : next
      if (commit) {
        const before = gesture ?? current
        if (!sameItems(before, value)) {
          past = [...past.slice(-49), before]
          future = []
        }
        gesture = null
      }
      current = value
    },
    /** updater 必须是纯函数；新结果使用幂等追加，已有节点保留各快照的布局。 */
    receive(update: (items: CanvasItem[]) => CanvasItem[]) {
      current = update(current)
      past = past.map(update)
      future = future.map(update)
      if (gesture) gesture = update(gesture)
    },
    undo() {
      history.endMove()
      const previous = past.pop()
      if (previous) { future.push(current); current = previous }
    },
    redo() {
      history.endMove()
      const next = future.pop()
      if (next) { past.push(current); current = next }
    },
  }
  return history
}
