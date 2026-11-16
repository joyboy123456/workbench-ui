'use client'
import React, { useEffect } from 'react'
import type { ImageRef } from '@/lib/v2/types'
import { Icon } from './icons'
import { useToast } from './ui'

export interface LightboxItem {
  id: string
  image: ImageRef
  title?: string
  prompt?: string
  modelName?: string
  ratio?: string
  resolution?: string
  createdAt?: string
  favorite?: boolean
  projectId?: string
  generationId?: string
}

export interface LightboxProps {
  items: LightboxItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  onDownload?: (item: LightboxItem) => void
  onToggleFavorite?: (item: LightboxItem) => void
  onUseAsReference?: (item: LightboxItem) => void
  onRegenerate?: (item: LightboxItem) => void
}

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onDownload,
  onToggleFavorite,
  onUseAsReference,
  onRegenerate,
}: LightboxProps) {
  const toast = useToast()
  const safeIndex = Math.max(0, Math.min(index, items.length - 1))
  const item = items[safeIndex]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (safeIndex > 0) onIndexChange(safeIndex - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (safeIndex < items.length - 1) onIndexChange(safeIndex + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [safeIndex, items.length, onIndexChange, onClose])

  if (!item) return null

  const ratioLabel = item.ratio || `${item.image.width}:${item.image.height}`
  const resLabel = item.resolution ? `${item.resolution.toUpperCase()} (${item.image.width}×${item.image.height})` : `${item.image.width}×${item.image.height}`
  const timeLabel = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '刚刚'

  const handleDownload = () => {
    if (onDownload) {
      onDownload(item)
      return
    }
    const a = document.createElement('a')
    a.href = item.image.url
    a.download = `图片-${item.image.id}.png`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    toast('已发起下载')
  }

  return (
    <div
      className="lb-bg"
      role="dialog"
      aria-modal="true"
      aria-label={item.title ?? '大图预览'}
      onClick={onClose}
    >
      <div className="lb-shell" onClick={(e) => e.stopPropagation()}>
        <div className="lb-stage">
          <button
            type="button"
            className="lb-nav prev"
            aria-label="上一张"
            disabled={safeIndex <= 0}
            onClick={() => onIndexChange(safeIndex - 1)}
          >
            <Icon name="left" size={20} />
          </button>

          <div className="lb-media">
            <img src={item.image.url} alt={item.title ?? item.prompt ?? '生成大图'} />
          </div>

          <button
            type="button"
            className="lb-nav next"
            aria-label="下一张"
            disabled={safeIndex >= items.length - 1}
            onClick={() => onIndexChange(safeIndex + 1)}
          >
            <Icon name="right" size={20} />
          </button>

          <div className="lb-counter tnum" aria-live="polite">
            {safeIndex + 1} / {items.length}
          </div>
        </div>

        <aside className="lb-aside">
          <div className="lb-head">
            <h2>{item.title ?? '大图与参数'}</h2>
            <button type="button" className="ibtn" aria-label="关闭预览" onClick={onClose}>
              <Icon name="x" size={18} />
            </button>
          </div>

          {items.length > 1 && (
            <div className="lb-sec">
              <div className="lb-sec-h">
                <span>同批次作品</span>
                <small className="tnum">{items.length} 张</small>
              </div>
              <div className="lb-thumbs">
                {items.map((it, idx) => (
                  <button
                    key={it.id}
                    type="button"
                    className={'lb-thumb' + (idx === safeIndex ? ' on' : '')}
                    aria-label={`切换到第 ${idx + 1} 张`}
                    aria-pressed={idx === safeIndex}
                    onClick={() => onIndexChange(idx)}
                  >
                    <img src={it.image.thumbUrl ?? it.image.url} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="lb-sec">
            <div className="lb-sec-h">
              <span>提示词</span>
              <button
                type="button"
                className="lb-copy"
                disabled={!item.prompt}
                onClick={() => {
                  if (!item.prompt) return
                  void navigator.clipboard?.writeText(item.prompt)
                  toast('提示词已复制')
                }}
              >
                <Icon name="copy" size={12} />
                复制
              </button>
            </div>
            <p className={'lb-prompt' + (!item.prompt ? ' empty' : '')}>
              {item.prompt || '暂无提示词记录'}
            </p>
          </div>

          <div className="lb-sec">
            <div className="lb-sec-h"><span>生成参数</span></div>
            <dl className="lb-params">
              <div><dt>模型</dt><dd>{item.modelName || 'Nano Banana 2'}</dd></div>
              <div><dt>比例</dt><dd className="tnum">{ratioLabel}</dd></div>
              <div><dt>分辨率</dt><dd className="tnum">{resLabel}</dd></div>
              <div><dt>时间</dt><dd className="tnum">{timeLabel}</dd></div>
            </dl>
          </div>

          <div className="lb-actions">
            <button type="button" className="btn" onClick={handleDownload}>
              <Icon name="dl" size={14} />下载
            </button>
            {onToggleFavorite && (
              <button
                type="button"
                className={'btn' + (item.favorite ? ' active' : '')}
                aria-pressed={Boolean(item.favorite)}
                onClick={() => onToggleFavorite(item)}
              >
                <Icon name="star" size={14} />{item.favorite ? '已收藏' : '收藏'}
              </button>
            )}
            {onUseAsReference && (
              <button type="button" className="btn" onClick={() => onUseAsReference(item)}>
                <Icon name="quote" size={14} />用作参考
              </button>
            )}
            {onRegenerate && (
              <button type="button" className="btn pri" onClick={() => onRegenerate(item)}>
                <Icon name="wand" size={14} />再生成
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
