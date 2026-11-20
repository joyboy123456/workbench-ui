// 不依赖 zod 的轻量常量，供客户端首屏引用。
/** Separate namespace: never interpreted as a user asset ID or an OSS object key. */
export const PUBLIC_MODEL_PREFIX = 'public-model:'
export function publicModelReferenceId(id: string) { return `${PUBLIC_MODEL_PREFIX}${id}` }
export function publicModelImageUrl(id: string, thumbnail = false) {
  return `/api/presets/models/${encodeURIComponent(id)}/image${thumbnail ? '?size=thumb' : ''}`
}
