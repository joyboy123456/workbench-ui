'use client'
import React, { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { imageDimensions, imageRatio } from '@/lib/v2/image-metadata'
import { comparePair, compareSibling, compareSourceId, sliderClip } from '@/lib/v2/compare'
import type { CanvasItem, ImageRef } from '@/lib/v2/types'
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
  projectName?: string
  generationId?: string
  canvasItemId?: string
  outputCount?: number
}

export interface LightboxProps {
  items: LightboxItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  onDownload?: (item: LightboxItem) => void | Promise<void>
  onToggleFavorite?: (item: LightboxItem) => void | Promise<void>
  onUseAsReference?: (item: LightboxItem) => void | Promise<void>
  onRegenerate?: (item: LightboxItem) => void | Promise<void>
  onLocate?: (item: LightboxItem) => void
  loading?: boolean
  error?: string
  onRetry?: () => void
  /** H8 uses the original canvas identities and provenance, never guessed image URLs. */
  comparison?: {
    items: CanvasItem[]
    selection?: readonly string[]
    initial?: boolean
    onNavigate: (itemId: string) => void
  }
}

/** The same viewer serves canvas images, generation history and references. */
export function Lightbox({ items, index, onIndexChange, onClose, onDownload, onToggleFavorite,
  onUseAsReference, onRegenerate, onLocate, loading, error, onRetry, comparison }: LightboxProps) {
  const toast = useToast()
  const dialog = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)
  const closeRequested = useRef(false)
  const closed = useRef(false)
  const finishClose = () => {
    if (closed.current) return
    closed.current = true
    dialog.current?.close()
    onClose()
  }
  const requestClose = () => {
    if (closeRequested.current) return
    closeRequested.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose()
    else setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    // Fallback for interrupted animation events; normal completion uses animationend.
    const timer = setTimeout(finishClose, 200)
    return () => clearTimeout(timer)
  }, [closing])
  const sliderId = useId()
  const [comparing, setComparing] = useState(Boolean(comparison?.initial))
  const [mode, setMode] = useState<'slider' | 'side'>(comparison?.selection?.length === 2 ? 'side' : 'slider')
  const [position, setPosition] = useState(50)
  const [busy, setBusy] = useState(false)
  const actionLock = useRef(false)
  const safeIndex = Math.max(0, Math.min(index, items.length - 1))
  const item = items[safeIndex]
  const canvasId = item?.canvasItemId ?? item?.id ?? ''
  const target = comparison?.selection?.length === 2 ? comparison.selection : canvasId
  const pair = useMemo(() => comparePair(target, comparison?.items ?? []), [target, comparison?.items])
  const direct = comparison?.selection?.length === 2
  const hasSource = Boolean(pair.right && compareSourceId(pair.right))
  const canCompare = Boolean(comparison && (direct ? pair.left && pair.right : hasSource))
  const showingCompare = comparing && Boolean(comparison)
  const previous = showingCompare ? compareSibling(pair, -1) : safeIndex > 0 ? items[safeIndex - 1].id : null
  const next = showingCompare ? compareSibling(pair, 1) : safeIndex < items.length - 1 ? items[safeIndex + 1].id : null
  const unavailable = Boolean(loading || error || !item)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { if (element?.open) element.close() }
  }, [])

  const move = (direction: -1 | 1) => {
    if (busy || unavailable) return
    const id = direction === -1 ? previous : next
    if (!id) return
    if (showingCompare) comparison?.onNavigate(id)
    else onIndexChange(safeIndex + direction)
  }
  const key = (event: KeyboardEvent<HTMLDialogElement>) => {
    // Native modal owns Escape and focus. Keep canvas shortcuts off this surface.
    event.stopPropagation()
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowLeft' ? -1 : 1)
    } else if (event.key.toLowerCase() === 'c' && canCompare && !event.repeat) {
      event.preventDefault()
      setComparing(value => !value)
    }
  }
  const act = async (fn: () => void | Promise<void>) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    try { await fn() }
    catch (failure) { toast(failure instanceof Error ? failure.message : '操作失败，请重试') }
    finally { actionLock.current = false; setBusy(false) }
  }
  const download = () => {
    if (!item) return
    if (onDownload) return onDownload(item)
    const a = document.createElement('a')
    a.href = item.image.url
    a.download = `图片-${item.image.id}.png`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    toast('已发起下载')
  }
  const missingSource = hasSource ? '来源图片已从画布删除' : '这张图片没有记录来源'
  const unavailableLeft = pair.left && (pair.left.status === 'running' || pair.left.status === 'failed') ? '来源图片暂不可查看' : undefined
  const unavailableRight = pair.right && (pair.right.status === 'running' || pair.right.status === 'failed') ? '这张结果暂不可查看' : undefined
  const leftLabel = direct ? '图片 A' : '来源'
  const rightLabel = direct ? '图片 B' : '结果'
  const rightImage = pair.right?.image ?? item?.image
  const siblingIndex = pair.siblings.findIndex(sibling => sibling.id === pair.right?.id)

  return (
    <dialog ref={dialog} className="lb-bg" data-closing={closing || undefined} aria-label={item?.title ?? '大图预览'}
      onClose={() => { if (!dialog.current?.open) finishClose() }}
      onCancel={event => { event.preventDefault(); requestClose() }}
      onAnimationEnd={event => { if (closing && event.target === event.currentTarget && event.animationName === 'v2-lb-out') finishClose() }}
      onKeyDown={key} onKeyUp={event => event.stopPropagation()}
      onCopy={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}
      onClick={event => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="lb-shell">
        <div className="lb-stage">
          <button type="button" className="lb-nav prev" aria-label={showingCompare ? '上一个同来源结果' : '上一张'} disabled={!previous || busy || unavailable} onClick={() => move(-1)}><Icon name="left" size={20} /></button>
          {unavailable ? <div className="cv-compare-empty" role={error ? 'alert' : 'status'}>
            <span>{loading ? '正在读取作品详情…' : error ?? '图片不可用'}</span>
            {!loading && onRetry && <button type="button" className="btn" onClick={onRetry}>重新读取</button>}
          </div> : showingCompare ? <div className={`cv-compare-body${mode === 'side' ? ' cv-compare-side' : ''}`}>
            {mode === 'slider' ? <div className="cv-compare-wipe">
              <div className="cv-compare-labels"><span>{leftLabel}<small>{pair.left ? dimensions(pair.left.image) : missingSource}</small></span><span>{rightLabel}<small>{dimensions(rightImage)}</small></span></div>
              <div className="cv-compare-stack">
                <CompareImage key={`right:${rightImage?.url}`} image={rightImage} label={rightLabel} unavailable={unavailableRight} />
                <div className="cv-compare-reveal" style={{ clipPath: sliderClip(position, 100) }}><CompareImage key={`left:${pair.left?.image.url}`} image={pair.left?.image} label={leftLabel} unavailable={unavailableLeft ?? (!pair.left ? missingSource : undefined)} /></div>
                <span className="cv-compare-divider" style={{ left: `${position}%` }} aria-hidden><Icon name="left" size={12} /><Icon name="right" size={12} /></span>
                <input className="cv-compare-drag" id={sliderId} type="range" min="0" max="100" step="1" value={position} aria-valuetext={`左侧显示 ${position}%`} onChange={event => setPosition(Number(event.target.value))} />
              </div>
              <div className="cv-compare-range"><label htmlFor={sliderId}>对比位置</label><span>拖动或用方向键微调</span><output htmlFor={sliderId}>{position}%</output></div>
            </div> : <>
              <ComparePane image={pair.left?.image} label={leftLabel} unavailable={unavailableLeft ?? (!pair.left ? missingSource : undefined)} />
              <ComparePane image={rightImage} label={rightLabel} unavailable={unavailableRight} />
            </>}
          </div> : <div className="lb-media"><CompareImage key={item.image.url} image={item.image} label={item.title ?? item.prompt ?? '图片'} /></div>}
          <button type="button" className="lb-nav next" aria-label={showingCompare ? '下一个同来源结果' : '下一张'} disabled={!next || busy || unavailable} onClick={() => move(1)}><Icon name="right" size={20} /></button>
          <div className="lb-counter tnum" aria-live="polite">{showingCompare ? direct ? '已选 2 张' : `${siblingIndex + 1} / ${pair.siblings.length} · 同源结果` : `${item ? safeIndex + 1 : 0} / ${items.length}`}</div>
        </div>
        <aside className="lb-aside">
          <div className="lb-head"><h2>{showingCompare ? direct ? '图片对比' : '来源与结果' : item?.title ?? '大图与参数'}</h2><button type="button" className="ibtn" aria-label="关闭预览" autoFocus onClick={requestClose}><Icon name="x" size={18} /></button></div>
          <div className="lb-compare-controls">
            <button type="button" className={'btn' + (showingCompare ? ' active' : '')} aria-pressed={showingCompare} disabled={(!canCompare && !showingCompare) || unavailable} title={canCompare ? '对比 C' : '这张图片没有可对比的来源'} onClick={() => setComparing(value => !value)}><Icon name="layers" size={14} />对比</button>
            {showingCompare && <div className="cv-compare-modes" role="group" aria-label="对比方式"><button type="button" className={mode === 'slider' ? 'on' : ''} aria-pressed={mode === 'slider'} onClick={() => setMode('slider')}>滑杆</button><button type="button" className={mode === 'side' ? 'on' : ''} aria-pressed={mode === 'side'} onClick={() => setMode('side')}>并排</button></div>}
          </div>
          {item && !error && <>
            {items.length > 1 && !showingCompare && <div className="lb-sec"><div className="lb-sec-h"><span>作品列表</span><small className="tnum">{items.length} 张</small></div><div className="lb-thumbs">{items.map((it, idx) => <button key={it.id} type="button" className={'lb-thumb' + (idx === safeIndex ? ' on' : '')} disabled={busy || loading} aria-label={`切换到第 ${idx + 1} 张`} aria-pressed={idx === safeIndex} onClick={() => onIndexChange(idx)}><img src={it.image.thumbUrl ?? it.image.url} alt="" /></button>)}</div></div>}
            <div className="lb-sec"><div className="lb-sec-h"><span>提示词</span><button type="button" className="lb-copy" disabled={!item.prompt || busy || loading} onClick={() => void act(async () => { if (!navigator.clipboard) throw new Error('当前环境无法复制，请手动复制提示词'); await navigator.clipboard.writeText(item.prompt ?? ''); toast('提示词已复制') })}><Icon name="copy" size={12} />复制</button></div><p className={'lb-prompt' + (!item.prompt ? ' empty' : '')}>{item.prompt || '暂无提示词记录'}</p></div>
            <div className="lb-sec"><div className="lb-sec-h"><span>生成参数</span></div><dl className="lb-params">
              <div><dt>模型</dt><dd>{item.modelName || '未记录'}</dd></div>
              <div><dt>比例</dt><dd className="tnum">{imageRatio(item.image)}</dd></div>
              <div><dt>分辨率</dt><dd className="tnum">{item.resolution ? `${item.resolution.toUpperCase()} (${imageDimensions(item.image)})` : imageDimensions(item.image)}</dd></div>
              <div><dt>时间</dt><dd className="tnum">{item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '未记录'}</dd></div>
              <div><dt>生成张数</dt><dd>{item.outputCount ? `${item.outputCount} 张` : '未记录'}</dd></div>
            </dl></div>
            {onLocate && <div className="lb-sec"><div className="lb-sec-h">来源项目</div><button type="button" className="btn" disabled={unavailable} onClick={() => onLocate(item)}><Icon name="canvas" size={14} />{item.projectName ?? '定位画布'}</button></div>}
            <div className="lb-actions">
              <button type="button" className="btn" disabled={busy || unavailable} onClick={() => void act(download)}><Icon name="dl" size={14} />下载</button>
              {onToggleFavorite && <button type="button" className={'btn' + (item.favorite ? ' active' : '')} disabled={busy || unavailable || !item.generationId} aria-pressed={Boolean(item.favorite)} onClick={() => void act(() => onToggleFavorite(item))}><Icon name="star" size={14} />{item.favorite ? '已收藏' : '收藏'}</button>}
              {onUseAsReference && <button type="button" className="btn" disabled={busy || unavailable} onClick={() => void act(() => onUseAsReference(item))}><Icon name="quote" size={14} />用作参考</button>}
              {onRegenerate && <button type="button" className="btn pri" disabled={busy || unavailable} onClick={() => void act(() => onRegenerate(item))}><Icon name="wand" size={14} />再生成</button>}
            </div>
          </>}
        </aside>
      </div>
    </dialog>
  )
}

function ComparePane({ image, label, unavailable }: { image?: ImageRef; label: string; unavailable?: string }) {
  return (
    <figure className="cv-compare-pane">
      <figcaption><span>{label}</span><small>{dimensions(image)}</small></figcaption>
      <CompareImage key={image?.url} image={image} label={label} unavailable={unavailable} />
    </figure>
  )
}

const dimensions = imageDimensions

function CompareImage({ image, label, unavailable }: { image?: ImageRef; label: string; unavailable?: string }) {
  const [failed, setFailed] = useState(false)
  if (unavailable || !image?.url || failed) {
    return <div className="cv-compare-empty" role="status"><Icon name="img" size={28} /><span>{unavailable ?? (failed ? `${label}加载失败，请关闭后重试` : `${label}图片不可用`)}</span></div>
  }
  return <div className="cv-compare-image"><img src={image.url} alt={label} draggable={false} onError={() => setFailed(true)} /></div>
}
