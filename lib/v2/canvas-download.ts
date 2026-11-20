import { safeName } from './export-plan'
import { previewWebp } from './canvas-raster'
import type { V2DataSource } from './data-source'
import type { CanvasItem } from './types'

export async function canvasDownload(ds: Pick<V2DataSource, 'readCanvasImage'>, item: CanvasItem, format: 'original' | 'webp') {
  const blob = format === 'webp' ? await previewWebp(ds, item) : await ds.readCanvasImage(item.image)
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' }
  const extension = extensions[blob.type] ?? 'img'
  return { blob, name: `${safeName(`图片-${item.image.id}`)}.${extension}` }
}
