import { exportImageUrl } from './export-source'
import type { ImageRef } from './types'

/** Adapter helper: media routes recheck ownership and proxy private storage. */
export async function readCanvasImage(image: ImageRef): Promise<Blob> {
  const url = exportImageUrl(image).replace(/^(\/api\/media\/assets\/[^/?]+)\/[^?]+/, '$1/original')
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error(`读取图片失败（${response.status}）`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('图片响应格式无效')
  return blob
}
