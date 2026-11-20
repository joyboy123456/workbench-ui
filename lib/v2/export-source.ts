import type { ImageRef } from './types'

/** Request authenticated bytes, never a CDN redirect that can taint canvas. */
export function exportImageUrl(image: ImageRef): string {
  if (image.url.startsWith('/api/media/assets/')) {
    const url = new URL(image.url, 'https://local.invalid')
    url.searchParams.set('proxy', '1')
    return url.pathname + url.search
  }
  if (/^(asset_|result_)/.test(image.id)) return `/api/media/assets/${encodeURIComponent(image.id)}/original?proxy=1`
  return image.url
}
