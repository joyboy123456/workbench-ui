'use client'
import React, { useEffect, useRef, useState } from 'react'
import type { ChatAttachment } from '@/lib/v2/types'
import { Icon } from './icons'

export interface MaskBrushDialogProps {
  attachment: ChatAttachment
  onSave: (maskUrl: string) => void
  onClear?: () => void
  onClose: () => void
}

export function MaskBrushDialog({ attachment, onSave, onClear, onClose }: MaskBrushDialogProps) {
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const [brushSize, setBrushSize] = useState(28)
  const [hasStrokes, setHasStrokes] = useState(Boolean(attachment.mask?.url))
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  const width = Math.max(240, Math.min(640, attachment.image.width || 512))
  const height = Math.max(240, Math.min(540, Math.round((width * (attachment.image.height || 512)) / Math.max(1, attachment.image.width || 512))))

  useEffect(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (attachment.mask?.url) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      img.src = attachment.mask.url
    }
  }, [attachment.mask?.url, width, height])

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    }
  }

  const strokeTo = (pt: { x: number; y: number }) => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.85)'
    ctx.fillStyle = 'rgba(139, 92, 246, 0.85)'
    const prev = lastPointRef.current
    if (prev) {
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    lastPointRef.current = pt
    setHasStrokes(true)
  }

  const handleClear = () => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
    onClear?.()
  }

  const handleConfirm = () => {
    const src = maskCanvasRef.current
    if (!src || !hasStrokes) {
      onClear?.()
      onClose()
      return
    }
    // 导出标准黑白遮罩 PNG（黑底白涂抹区）
    const out = document.createElement('canvas')
    out.width = src.width
    out.height = src.height
    const octx = out.getContext('2d')
    const sctx = src.getContext('2d')
    if (!octx || !sctx) {
      onClose()
      return
    }
    const pixels = sctx.getImageData(0, 0, src.width, src.height)
    const binary = octx.createImageData(src.width, src.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const painted = pixels.data[i + 3] > 20 ? 255 : 0
      binary.data[i] = painted
      binary.data[i + 1] = painted
      binary.data[i + 2] = painted
      binary.data[i + 3] = 255
    }
    octx.putImageData(binary, 0, 0)
    onSave(out.toDataURL('image/png'))
    onClose()
  }

  return (
    <div className="mask-dlg-backdrop" role="dialog" aria-modal="true" aria-label={`涂抹局部遮罩：${attachment.label}`} onClick={onClose}>
      <div className="mask-dlg" onClick={e => e.stopPropagation()}>
        <div className="mask-dlg-hd">
          <div>
            <h3>局部涂抹遮罩</h3>
            <p>涂抹需要修改的区域，将作为 brush mask 随消息一起发送</p>
          </div>
          <button type="button" className="ibtn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="mask-dlg-stage" style={{ width, height }}>
          <img src={attachment.image.url} alt={attachment.label} draggable={false} />
          <canvas
            ref={maskCanvasRef}
            width={width}
            height={height}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drawingRef.current = true
              lastPointRef.current = null
              strokeTo(getPoint(e))
            }}
            onPointerMove={e => {
              if (!drawingRef.current) return
              strokeTo(getPoint(e))
            }}
            onPointerUp={() => {
              drawingRef.current = false
              lastPointRef.current = null
            }}
            onPointerCancel={() => {
              drawingRef.current = false
              lastPointRef.current = null
            }}
          />
        </div>

        <div className="mask-dlg-ft">
          <label className="mask-brush-ctrl">
            <span>画笔大小</span>
            <input
              type="range"
              min={8}
              max={72}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
            />
            <span className="tnum">{brushSize}px</span>
          </label>
          <div className="mask-dlg-actions">
            <button type="button" className="btn" onClick={handleClear}>清除遮罩</button>
            <button type="button" className="btn pri" onClick={handleConfirm}>应用遮罩</button>
          </div>
        </div>
      </div>
    </div>
  )
}
