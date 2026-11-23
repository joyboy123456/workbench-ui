export interface ExportSize { width: number; height: number }
export type ExportSizeMode = 'original' | '2k' | '1k'

const MAX_EXPORT_EDGE = 16384
const MAX_EXPORT_PIXELS = 32 * 1024 * 1024

export interface OutputRect {
  canvasW: number; canvasH: number
}

function dimension(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('尺寸须为大于 0 的整数像素')
  return value
}

/** 按解码后的原图尺寸等比缩小，不放大小图。 */
export function computeOutputRect(src: ExportSize, size: ExportSizeMode): OutputRect {
  const sw = dimension(src.width)
  const sh = dimension(src.height)
  const edge = size === '2k' ? 2048 : 1024
  const scale = size === 'original' ? 1 : Math.min(1, edge / Math.max(sw, sh))
  const canvasW = Math.max(1, Math.round(sw * scale))
  const canvasH = Math.max(1, Math.round(sh * scale))
  if (canvasW > MAX_EXPORT_EDGE || canvasH > MAX_EXPORT_EDGE || canvasW * canvasH > MAX_EXPORT_PIXELS) {
    throw new RangeError('导出尺寸过大，请将单边限制在 16384 像素内、总像素限制在 32MP 内')
  }
  return { canvasW, canvasH }
}

const MAX_NAME_BYTES = 160
function shorten(value: string, limit = MAX_NAME_BYTES) {
  const encoder = new TextEncoder()
  let result = ''
  let bytes = 0
  for (const char of value) {
    bytes += encoder.encode(char).length
    if (bytes > limit) break
    result += char
  }
  return result
}
export function safeName(value: string, limit = MAX_NAME_BYTES) {
  const clean = shorten(value.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').trim(), limit).replace(/[. ]+$/g, '') || '图片'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean
}

/** 返回无扩展名的文件名；保留序号并替换非法字符。 */
export function fileName(projectName: string, index: number): string {
  dimension(index)
  return safeName(`${shorten(projectName, 96)}_${String(index).padStart(3, '0')}`)
}
