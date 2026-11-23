import type { CanvasItem } from './types'

/** 仅由 mock 数据源的开发态 ?mockNodes=300 使用，不进入 API 保存或调用供应商。 */
export function createStressCanvas(source: CanvasItem[]): CanvasItem[] {
  const images = source.length ? source.map(item => item.image) : [{ id: 'stress-image', url: '/v2-mock/c1.jpg', width: 640, height: 857 }]
  return Array.from({ length: 300 }, (_, index) => {
    const image = images[index % images.length]
    const id = `stress-${index}`
    return {
      id, image, x: (index % 20) * 240 + index % 7 * 11, y: Math.floor(index / 20) * 340 + index % 3 * 17,
      w: 90 + index % 6 * 25,
      createdAt: new Date(Date.UTC(2026, 10, 1) + index * 60_000).toISOString(),
      ref: index % 4 === 0 ? { type: 'product', id, imageId: image.id } : index % 4 === 2 ? { type: 'generation', id } : { type: 'material', id },
      assetKind: index % 4 === 1 ? 'model' : undefined,
    }
  })
}
