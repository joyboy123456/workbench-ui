import type { BrandKit, ChatAttachment, FashionModel, ImageRef, Material, Product, ToolDef, ToolParams } from './types'

export const REFERENCE_GROUPS = ['画布上的图', '商品', '模特', '品牌', '素材'] as const
export interface ReferenceChoice {
  key: string
  label: string
  group: typeof REFERENCE_GROUPS[number]
  image?: ImageRef
  attachment?: ChatAttachment
}
export function referenceChoices(canvas: { id: string; label: string; image: ImageRef }[], products: Product[], models: FashionModel[], brands: BrandKit[], materials: Material[]): ReferenceChoice[] {
  const choice = (kind: ChatAttachment['kind'], id: string, label: string, group: ReferenceChoice['group'], image?: ImageRef): ReferenceChoice => ({
    key: `${kind}:${id}`, label, group, image, attachment: image ? { kind, id, label, image } : undefined,
  })
  return [
    ...canvas.map(item => choice('canvas', item.id, item.label, '画布上的图', item.image)),
    ...products.map(item => choice('product', item.id, item.name, '商品', item.images[0])),
    ...models.map(item => choice('model', item.id, item.name, '模特', item.cover)),
    ...brands.map(item => choice('brand', item.id, item.name, '品牌', item.logo ?? item.references[0])),
    ...materials.map(item => choice('material', item.id, item.name, '素材', item.image)),
  ]
}
export function mergeAttachments(current: ChatAttachment[], incoming: ChatAttachment[], limit = 10) {
  const next = [...current]
  for (const item of incoming) if (!next.some(existing => existing.image.id === item.image.id)) next.push(item)
  return next.slice(0, limit)
}
export function mentionAt(text: string, caret: number) {
  const match = /(^|\s)([@*/])([^\s@*/]*)$/.exec(text.slice(0, caret))
  if (!match) return null
  return { kind: match[2], query: match[3], start: caret - match[3].length - 1, end: caret }
}
export function removeMention(text: string, mention: { start: number; end: number } | null) {
  return mention ? text.slice(0, mention.start) + text.slice(mention.end) : text
}
export function missingToolFields(def: ToolDef, params: ToolParams) {
  return (def.fields ?? []).filter(field => !field.optional).filter(field => {
    const value = params[field.id] ?? field.default
    if (field.kind === 'text') return !String(value ?? '').trim()
    if (Array.isArray(value)) return !value.length
    return value === undefined || value === ''
  }).map(field => field.label)
}

export function readDroppedAttachment(raw: string): ChatAttachment | undefined {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('kind' in value) || !('id' in value) || !('label' in value) || !('image' in value)) return
    const { kind, id, label, image } = value
    if (typeof kind !== 'string' || !['product', 'model', 'brand', 'canvas', 'material', 'upload'].includes(kind) || typeof id !== 'string' || typeof label !== 'string' || !image || typeof image !== 'object') return
    if (!('id' in image) || !('url' in image) || !('width' in image) || !('height' in image)) return
    if (typeof image.id !== 'string' || typeof image.url !== 'string' || !/^(https?:|blob:|\/)/.test(image.url) || typeof image.width !== 'number' || !Number.isFinite(image.width) || image.width <= 0 || typeof image.height !== 'number' || !Number.isFinite(image.height) || image.height <= 0) return
    const attachment = { id, label, image: { id: image.id, url: image.url, width: image.width, height: image.height } }
    switch (kind) {
      case 'product': case 'model': case 'brand': case 'canvas': case 'material': case 'upload': return { ...attachment, kind }
    }
  } catch { return undefined }
}
