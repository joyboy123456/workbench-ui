/** 展示只使用压缩版；调用方把未经处理的地址单独保存为 sourceUrl。 */
const DISPLAY_TRANSFORMS = {
  card: 'image/resize,w_400/quality,q_80/format,webp',
  detail: 'image/resize,l_1600/quality,q_82/format,webp',
} as const

export function yibaiCaseImageUrl(sourceUrl: string, size: keyof typeof DISPLAY_TRANSFORMS = 'card'): string {
  const url = new URL(sourceUrl)
  url.searchParams.set('x-oss-process', DISPLAY_TRANSFORMS[size])
  return url.toString()
}

export function clothingCaseAspect(width: number, height: number): 'tall' | 'square' | 'wide' {
  const ratio = width / height
  return ratio < 0.9 ? 'tall' : ratio > 1.1 ? 'wide' : 'square'
}
