import type { OutputRect } from './export-plan'

/** 仅 canvas 绘制；图片解码、参数校验、编码与下载由导出编排负责。 */
export function renderExport(source: CanvasImageSource, rect: OutputRect, whiteBackground: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = rect.canvasW
  canvas.height = rect.canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器无法创建导出画布')
  if (whiteBackground) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.canvasW, rect.canvasH)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, rect.canvasW, rect.canvasH)
  return canvas
}
