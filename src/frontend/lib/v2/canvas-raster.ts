import { itemHeight, placeResults } from './arrange'
import { computeOutputRect } from './export-plan'
import { selectionBounds, usableImage } from './selection-actions'
import type { V2DataSource } from './data-source'
import type { CanvasItem, ChatAttachment, ToolParams } from './types'

export type CanvasEdit = { kind: 'crop' | 'adjust'; params: ToolParams } | { kind: 'resize'; width: number; height: number } | { kind: 'merge' }
type RasterSource = Pick<V2DataSource, 'readCanvasImage' | 'uploadChatAttachment'>

/** A resized node keeps its identity; existing composer references follow it. */
export function refreshCanvasAttachments(attachments: ChatAttachment[], outputs: CanvasItem[]) {
  return attachments.map(attachment => {
    const output = attachment.kind === 'canvas' ? outputs.find(item => item.id === attachment.id) : undefined
    return output ? { ...attachment, image: output.image } : attachment
  })
}

export function proportionalSize(width: number, height: number, axis: 'width' | 'height', value: number, locked: boolean) {
  const size = { width, height, [axis]: value }
  if (locked) {
    if (axis === 'width') size.height = Math.max(1, Math.round(value * height / width))
    else size.width = Math.max(1, Math.round(value * width / height))
  }
  computeOutputRect(size, 'original')
  return size
}

/** Pixel density follows the sharpest source; order follows the canvas layers. */
export function mergeGeometry(items: CanvasItem[]) {
  if (items.length < 2 || items.some(item => !usableImage(item))) throw new Error('请选择至少两张已完成的图片')
  const bounds = selectionBounds(items)
  const scale = Math.max(...items.map(item => item.image.width / item.w))
  const width = Math.max(1, Math.round((bounds.right - bounds.x) * scale))
  const height = Math.max(1, Math.round((bounds.bottom - bounds.y) * scale))
  computeOutputRect({ width, height }, 'original')
  return { width, height, bounds, layers: items.map(item => ({
    id: item.id, x: (item.x - bounds.x) * scale, y: (item.y - bounds.y) * scale,
    width: item.w * scale, height: itemHeight(item) * scale,
  })) }
}

export async function decodeCanvasImage(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally { URL.revokeObjectURL(url) }
}
export function encodeCanvas(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== type) reject(new Error('当前浏览器无法编码此图片格式'))
    else resolve(blob)
  }, type, 0.9))
}
function surface(width: number, height: number) {
  computeOutputRect({ width, height }, 'original')
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法处理图片')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}
export function adjustmentFilter(params: ToolParams) {
  const n = (key: string) => Number(params[key] ?? 0)
  const temp = n('temp')
  return [`brightness(${1 + n('bright') / 100})`, `contrast(${1 + n('contrast') / 100})`, `saturate(${1 + n('sat') / 100})`,
    temp > 0 ? `sepia(${temp / 160})` : '', temp < 0 ? `hue-rotate(${temp / 4}deg)` : ''].filter(Boolean).join(' ')
}

/** All byte reads and uploads go through the same mock/API data seam. */
export async function editCanvasImages(ds: RasterSource, sources: CanvasItem[], edit: CanvasEdit): Promise<CanvasItem[]> {
  if (!ds.uploadChatAttachment) throw new Error('图片上传暂不可用')
  if (!sources.length || sources.some(item => !usableImage(item))) throw new Error('请选择已完成的图片')
  if (edit.kind === 'resize' && sources.some(item => item.resolutionLocked)) throw new Error('请先解除分辨率锁定')
  const outputs: CanvasItem[] = []
  const groups = edit.kind === 'merge' ? [sources] : sources.map(item => [item])
  for (const group of groups) {
    const first = group[0]
    const geometry = edit.kind === 'merge' ? mergeGeometry(group) : undefined
    const image = await decodeCanvasImage(await ds.readCanvasImage(first.image))
    let width = geometry?.width ?? image.naturalWidth, height = geometry?.height ?? image.naturalHeight
    let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight
    if (edit.kind === 'resize') { width = edit.width; height = edit.height }
    if (edit.kind === 'crop') {
      const [a, b] = String(edit.params.ratio ?? '1:1').split(':').map(Number)
      if (!(a > 0 && b > 0)) throw new Error('裁剪比例无效')
      if (sw / sh > a / b) sw = Math.round(sh * a / b)
      else sh = Math.round(sw * b / a)
      sx = (image.naturalWidth - sw) / 2; sy = (image.naturalHeight - sh) / 2
      width = sw; height = sh
    }
    const { canvas, ctx } = surface(width, height)
    if (geometry) {
      for (const [index, layer] of geometry.layers.entries()) {
        const decoded = index === 0 ? image : await decodeCanvasImage(await ds.readCanvasImage(group[index].image))
        ctx.drawImage(decoded, layer.x, layer.y, layer.width, layer.height)
      }
    } else {
      if (edit.kind === 'adjust') {
        if (!('filter' in ctx)) throw new Error('当前浏览器不支持调色保存')
        ctx.filter = adjustmentFilter(edit.params)
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
    }
    const file = new File([await encodeCanvas(canvas)], `${edit.kind}-${Date.now()}.png`, { type: 'image/png' })
    const attachment = await ds.uploadChatAttachment(file)
    outputs.push({ id: edit.kind === 'resize' ? first.id : `ci_${crypto.randomUUID()}`,
      ref: { type: 'material', id: attachment.id }, image: attachment.image,
      x: first.x, y: first.y, w: geometry ? geometry.bounds.right - geometry.bounds.x : first.w * width / image.naturalWidth,
      createdAt: new Date().toISOString(), status: 'done',
      parentIds: edit.kind === 'resize' ? first.parentIds : group.map(item => item.id),
      ...(edit.kind === 'resize' ? { aspectRatioLocked: first.aspectRatioLocked, resolutionLocked: first.resolutionLocked, locked: first.locked,
        parentId: first.parentId, layoutSection: first.layoutSection, assetKind: first.assetKind, createdAt: first.createdAt ?? new Date().toISOString() } : {}),
    })
  }
  return outputs
}

export function placeEditedImages(existing: CanvasItem[], outputs: CanvasItem[], edit: CanvasEdit) {
  if (edit.kind === 'resize') return existing.map(item => {
    const output = outputs.find(output => output.id === item.id)
    return output ? { ...output, x: item.x, y: item.y, locked: item.locked, resolutionLocked: item.resolutionLocked, aspectRatioLocked: item.aspectRatioLocked } : item
  })
  return [...existing, ...placeResults(existing, outputs)]
}

export async function previewWebp(ds: Pick<V2DataSource, 'readCanvasImage'>, item: CanvasItem) {
  const image = await decodeCanvasImage(await ds.readCanvasImage(item.image))
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
  const { canvas, ctx } = surface(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)))
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return encodeCanvas(canvas, 'image/webp')
}
