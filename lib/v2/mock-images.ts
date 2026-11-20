import type { ImageRef } from './types'

const PREFIX = '/__v2_mock_image/'
export interface MockBlobStore {
  put(id: string, blob: Blob): Promise<void>
  get(id: string): Promise<Blob | undefined>
}

export function localSaveError(cause: unknown): Error {
  const quota = cause instanceof Error && cause.name === 'QuotaExceededError'
  return new Error(quota ? '本地存储空间不足，本次更改未保存，请释放浏览器空间后重试' : '本地存储不可用，本次更改未保存，请检查浏览器存储权限后重试', { cause })
}

// Resolve writes only after transaction commit, so a returned image is durable.
export const indexedDBImages: MockBlobStore = {
  async put(id, blob) { await transaction('readwrite', store => store.put(blob, id)) },
  async get(id) {
    const value: unknown = await transaction('readonly', store => store.get(id))
    return value instanceof Blob ? value : undefined
  },
}
async function transaction(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  if (typeof indexedDB === 'undefined') throw new Error('浏览器不支持 IndexedDB')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('v2-mock-images', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('images')
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('图片存储被其他页面占用'))
  })
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('images', mode)
      const result = request(tx.objectStore('images'))
      tx.oncomplete = () => resolve(result.result)
      tx.onabort = () => reject(tx.error ?? result.error)
      tx.onerror = () => reject(tx.error ?? result.error)
    })
  } finally { db.close() }
}

/** ObjectURLs are page-local; only stable references are serialized. */
export function createMockImages(store: MockBlobStore = indexedDBImages) {
  const references = new Map<string, string>()
  const urls = new Map<string, Promise<string>>()
  async function add(blob: Blob) {
    const reference = PREFIX + crypto.randomUUID()
    try { await store.put(reference, blob) } catch (error) { throw localSaveError(error) }
    const url = URL.createObjectURL(blob)
    references.set(url, reference)
    urls.set(reference, Promise.resolve(url))
    return url
  }
  async function restoreUrl(reference: string) {
    let url = urls.get(reference)
    if (!url) {
      url = store.get(reference).then(blob => {
        if (!blob) throw new Error('本地图片文件缺失')
        const value = URL.createObjectURL(blob)
        references.set(value, reference)
        return value
      })
      urls.set(reference, url)
    }
    return url
  }
  async function walk(value: unknown, convert: (url: string) => Promise<string>): Promise<unknown> {
    if (typeof value === 'string') return convert(value)
    if (Array.isArray(value)) return Promise.all(value.map(item => walk(item, convert)))
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await walk(entry, convert)])))
    return value
  }
  return {
    async upload(file: File): Promise<ImageRef> {
      const url = await add(file)
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => reject(new Error('图片无法解码'))
        image.src = url
      })
      return { id: crypto.randomUUID(), url, ...size }
    },
    // Also migrate existing data URLs once, without accepting them in API schemas.
    async prepare(value: unknown): Promise<unknown> {
      return walk(value, async url => {
        if (references.has(url)) return references.get(url)!
        if (/^(data:image\/|blob:)/.test(url)) {
          const blob = await fetch(url).then(response => response.blob())
          const objectUrl = await add(blob)
          const reference = references.get(objectUrl)!
          references.set(url, reference)
          return reference
        }
        return url
      })
    },
    async restore<T>(value: T): Promise<T> {
      // The traversal only replaces URL strings; schema-validated structure is preserved.
      return await walk(value, url => url.startsWith(PREFIX) ? restoreUrl(url) : Promise.resolve(url)) as T
    },
    stringify(value: unknown): string {
      return JSON.stringify(value, (_key, entry: unknown) => {
        if (typeof entry !== 'string') return entry
        const reference = references.get(entry)
        if (reference) return reference
        if (/^(data:image\/|blob:)/.test(entry)) throw new Error('图片尚未保存，请重新上传后重试')
        return entry
      })
    },
  }
}
