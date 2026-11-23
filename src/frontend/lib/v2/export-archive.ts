import type { ImageRef } from './types'
import { computeOutputRect, fileName, safeName, type ExportSizeMode, type OutputRect } from './export-plan'
import { zipImages } from './generation-download'
import { renderExport } from './render-export'
import { exportImageUrl } from './export-source'

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg'
export const EXPORT_MIME: Record<ExportFormat, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }
export const MAX_EXPORT_FILES = 100
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024

export interface ExportOptions {
  projectName: string
  size: ExportSizeMode
  format: ExportFormat
}

interface LoadedExportImage {
  source: CanvasImageSource
  width: number
  height: number
  dispose(): void
}

/** 可替换浏览器 I/O，验证真实尺寸、编码与打包契约，无需测试 canvas 绘制。 */
export interface ExportIO {
  load(image: ImageRef, signal: AbortSignal): Promise<LoadedExportImage>
  encode(image: CanvasImageSource, rect: OutputRect, options: ExportOptions): Promise<Blob>
}

function abortIfNeeded(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('已取消导出', 'AbortError')
}

const browserIO: ExportIO = {
  load: (ref, signal) => new Promise((resolve, reject) => {
    abortIfNeeded(signal)
    const image = new Image()
    // 同源私有媒体继续携带 Cookie；外部签名图须允许匿名 CORS 才能编码 canvas。
    const source = exportImageUrl(ref)
    if (new URL(source, window.location.href).origin !== window.location.origin) image.crossOrigin = 'anonymous'
    const clean = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      image.onload = null
      image.onerror = null
    }
    const fail = (error: Error) => { clean(); image.src = ''; reject(error) }
    const cancel = () => fail(new DOMException('已取消导出', 'AbortError'))
    const timer = setTimeout(() => fail(new Error('图片加载超时，请稍后重试')), 30000)
    signal.addEventListener('abort', cancel, { once: true })
    image.onload = () => {
      clean()
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => { image.src = '' } })
    }
    image.onerror = () => fail(new Error('图片加载失败，请确认图片可访问且允许跨域导出'))
    image.src = source
  }),
  encode: async (image, rect, options) => {
    const canvas = renderExport(image, rect, options.format === 'jpg')
    try {
      if (options.format === 'svg') {
        const data = canvas.toDataURL('image/png')
        return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.canvasW}" height="${rect.canvasH}" viewBox="0 0 ${rect.canvasW} ${rect.canvasH}"><image width="100%" height="100%" href="${data}"/></svg>`], { type: EXPORT_MIME.svg })
      }
      return await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败，请减小导出尺寸')), EXPORT_MIME[options.format], 0.92)
        } catch {
          reject(new Error('图片编码失败，请确认图片允许跨域导出'))
        }
      })
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  },
}

/** 单张直接下载编码图片，多张串行打包；任意一项失败均不返回缺项 ZIP。 */
export async function createExportDownload(images: readonly ImageRef[], options: ExportOptions, signal: AbortSignal, onProgress?: (done: number, total: number) => void, io: ExportIO = browserIO): Promise<{ blob: Blob; name: string }> {
  if (!images.length || images.length > MAX_EXPORT_FILES) throw new Error('每次请选择 1–100 张图片')
  const snapshot = { ...options }
  const sources = images.map(image => ({ ...image }))
  const files: { name: string; bytes: Uint8Array }[] = []
  let size = 0
  for (const image of sources) {
    abortIfNeeded(signal)
    const loaded = await io.load(image, signal)
    try {
      abortIfNeeded(signal)
      const rect = computeOutputRect(loaded, snapshot.size)
      const blob = await io.encode(loaded.source, rect, snapshot)
      abortIfNeeded(signal)
      if (blob.type !== EXPORT_MIME[snapshot.format]) throw new Error(`当前浏览器不支持 ${snapshot.format.toUpperCase()} 编码，请更换格式`)
      size += blob.size
      if (size > MAX_ARCHIVE_BYTES) throw new Error('本次导出超过 100MB，请减少图片数量或尺寸')
      const name = `${fileName(snapshot.projectName, files.length + 1)}.${snapshot.format}`
      if (sources.length === 1) {
        onProgress?.(1, 1)
        abortIfNeeded(signal)
        return { blob, name }
      }
      files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) })
      onProgress?.(files.length, sources.length)
    } finally {
      loaded.dispose()
    }
  }
  abortIfNeeded(signal)
  return { blob: zipImages(files), name: `${safeName(snapshot.projectName)}_导出.zip` }
}
