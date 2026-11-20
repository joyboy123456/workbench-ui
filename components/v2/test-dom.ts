import { Window } from 'happy-dom'
export const browser = new Window({ url: 'http://localhost/v2' })
for (const key of ['self', 'window', 'Element', 'Event', 'CustomEvent', 'NodeFilter', 'HTMLButtonElement', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver']) {
  const value = Reflect.get(browser, key === 'window' ? 'window' : key)
  Object.defineProperty(globalThis, key, { configurable: true, value: typeof value === 'function' && /^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame)$/.test(key) ? value.bind(browser) : value })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
