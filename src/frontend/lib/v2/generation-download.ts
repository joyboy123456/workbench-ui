import type { GenerationDetail } from './generation-history'
import { exportImageUrl } from './export-source'

/** ZIP store mode: one download, no browser multi-download permission or new dependency. */
export function zipImages(files: { name: string; bytes: Uint8Array }[]): Blob {
  const chunks: Uint8Array[] = []
  const directory: Uint8Array[] = []
  const encoder = new TextEncoder()
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    let crc = 0xffffffff
    for (const byte of file.bytes) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    crc = (crc ^ 0xffffffff) >>> 0
    const header = new Uint8Array(30 + name.length)
    const h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true)
    h.setUint32(14, crc, true); h.setUint32(18, file.bytes.length, true); h.setUint32(22, file.bytes.length, true)
    h.setUint16(26, name.length, true); header.set(name, 30)
    const entry = new Uint8Array(46 + name.length)
    const e = new DataView(entry.buffer)
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true)
    e.setUint32(16, crc, true); e.setUint32(20, file.bytes.length, true); e.setUint32(24, file.bytes.length, true)
    e.setUint16(28, name.length, true); e.setUint32(42, offset, true); entry.set(name, 46)
    chunks.push(header, file.bytes); directory.push(entry); offset += header.length + file.bytes.length
  }
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
  e.setUint32(12, directory.reduce((sum, item) => sum + item.length, 0), true); e.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' })
}

export async function downloadGenerationArchive(ids: string[], get: (id: string) => Promise<GenerationDetail | null>) {
  if (!ids.length || ids.length > 100) throw new Error('每次请选择 1–100 张图片')
  const files: { name: string; bytes: Uint8Array }[] = []
  let size = 0
  for (const id of [...new Set(ids)]) {
    const detail = await get(id)
    if (!detail || detail.generation.status !== 'done') throw new Error('部分记录已不可用，请刷新后重试')
    const video = detail.generation.video
    const url = video?.url ?? exportImageUrl(detail.generation.image)
    const response = await fetch(url, { credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(video ? 120000 : 30000) })
    if (!response.ok) throw new Error(video ? '视频下载失败，请稍后重试' : '图片下载失败，请稍后重试')
    const blob = await response.blob()
    const extension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'video/mp4': 'mp4' }
    const ext = extension[blob.type.split(';')[0]]
    if (!ext) throw new Error('下载内容不是支持的图片')
    size += blob.size
    if (size > 100 * 1024 * 1024) throw new Error('本次文件超过 100MB，请减少选择数量')
    files.push({ name: `${files.length + 1}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }
  return zipImages(files)
}
