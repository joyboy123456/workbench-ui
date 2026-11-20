'use client'
import { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import type { CanvasItem, ImageRef } from '@/lib/v2/types'
import { Icon } from '../icons'
import { useToast } from '../ui'
import { GenerationFx, GenerationSource, genDelay, useGenerationState } from './generation-state'

/** 工具面板打开时画在图上的叠层 */
export type NodeOverlay =
  | { kind: 'mask'; brush: number; clearKey: number; onMask: (has: boolean, dataUrl?: string) => void }
  | { kind: 'frame-out' | 'frame-in'; ratio: number }
  | { kind: 'filter'; css: string }
export type ImageNodeData = { item: CanvasItem; multi: boolean; overlay?: NodeOverlay; onRetry?: (runId: string, item?: CanvasItem) => void | Promise<void> }
export type ImageNodeType = Node<ImageNodeData, 'img'>

/** A fixed output frame survives every lifecycle change; only its contents change. */
function ImageNodeImpl({ data, selected }: NodeProps<ImageNodeType>) {
  const { item, multi, overlay, onRetry } = data
  const { display } = useGenerationState(item)
  const toast = useToast()
  const running = item.status === 'running'
  const failed = item.status === 'failed'
  const [loadedUrl, setLoadedUrl] = useState('')
  const [failedUrl, setFailedUrl] = useState('')
  const [revealedUrl, setRevealedUrl] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [playing, setPlaying] = useState(false)
  useEffect(() => { setRetrying(false); setPlaying(false) }, [item.status, item.startedAt, item.toolRunId])
  const src = item.image.thumbUrl ?? item.image.url
  const videoReady = item.mediaType === 'video' && Boolean(item.video?.url) && !running && !failed
  const hasImg = Boolean(item.image.url && !running && !failed)
  const loadingImage = hasImg && loadedUrl !== src && failedUrl !== src && !videoReady
  const loading = running || loadingImage
  const loadFailed = hasImg && failedUrl === src && !videoReady
  const fog = loading || (hasImg && !loadFailed && !videoReady && revealedUrl !== src)
  const stageLabel = loadingImage ? '载入中' : display.label
  return (
    <div
      className={
        'node' +
        (hasImg && loadedUrl === src ? ' reveal' : '') +
        (selected && !multi ? ' sel' : '') +
        (failed || loadFailed ? ' failed' : '') +
        (fog ? ` gen${item.placeholder?.url ? ' gen-e' : ''} phase-${item.generationPhase ?? 'processing'}` : '') +
        (item.targetSize ? ' fixed-frame' : '')
      }
      style={fog ? { width: '100%', height: '100%', '--delay': genDelay(item.id) } as React.CSSProperties : { width: '100%', height: '100%' }}
      data-generation-state={failed || loadFailed ? 'failed' : loadingImage ? 'processing' : item.status === 'done' ? 'done' : item.generationPhase}
    >
      {hasImg && !videoReady && <img key={`${src}:${loadAttempt}`} src={src} alt="" draggable={false}
        className={loadedUrl === src ? 'result-loaded' : 'result-loading'}
        onLoad={() => {
          setLoadedUrl(src); setFailedUrl('')
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRevealedUrl(src)
        }} onError={() => setFailedUrl(src)}
        style={overlay?.kind === 'filter' ? { filter: overlay.css } : undefined} />}
      {videoReady && item.video && (playing ? (
        <video className="node-video nodrag nopan nowheel" src={item.video.url} controls autoPlay playsInline
          onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); toast('视频播放失败，可尝试重新打开') }}
          onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} />
      ) : (
        <div className="node-video-poster nodrag nopan" role="button" tabIndex={0} aria-label="播放视频" title="播放视频（双击也可）"
          onClick={event => { event.stopPropagation(); setPlaying(true) }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPlaying(true) } }}
          onDoubleClick={event => { event.stopPropagation(); setPlaying(true) }}>
          <img src={src} alt="" draggable={false} className="result-loaded" />
          <span className="node-video-play"><Icon name="play" size={26} /></span>
          <span className="node-video-dim tnum">{Math.round(item.video.duration)} 秒</span>
        </div>
      ))}
      {overlay?.kind === 'mask' && <MaskLayer image={item.image} brush={overlay.brush} clearKey={overlay.clearKey} onMask={overlay.onMask} />}
      {overlay?.kind === 'frame-in' && <i className="ov-crop" style={frameIn(item.image.width / item.image.height, overlay.ratio)} />}
      {fog && <div className={'node-fog' + (!loading ? ' fading' : '')}
        onAnimationEnd={event => { if (event.target === event.currentTarget && !loading) setRevealedUrl(src) }}>
        <GenerationSource image={item.placeholder} />
        <GenerationFx id={item.id} paused={item.generationPhase === 'unconfirmed'} />
        {loading && <span className="gen-pill" role="status">{stageLabel}</span>}
      </div>}
      {(failed || loadFailed) && <div className="generation-failure nodrag nopan nowheel" role="status">
        <Icon name="alert" size={20} />
        <div className="gen-fail-head">
          <strong>{loadFailed ? '图片暂未载入' : '生成未完成'}</strong>
          {!loadFailed && <span className="gen-unbilled">未扣费</span>}
        </div>
        <span className="nodrag nowheel">{loadFailed ? '结果已生成，可重新加载查看。' : item.errorMessage ?? '生成失败，请稍后重试。'}</span>
        {loadFailed ? <button className="nodrag nopan" onClick={(event) => { event.stopPropagation(); setFailedUrl(''); setLoadAttempt(value => value + 1) }}><Icon name="retry" size={12} />重新加载图片</button>
          : item.retryAllowed && item.toolRunId && onRetry ? <button className="nodrag nopan" disabled={retrying} onClick={async (event) => {
            event.stopPropagation()
            if (!item.toolRunId || retrying) return
            setRetrying(true)
            try { await onRetry(item.toolRunId, item) }
            catch (error) { toast(error instanceof Error ? error.message : '重试提交未能确认，请查询原任务') }
            finally { setRetrying(false) }
          }}><Icon name="retry" size={12} />{retrying ? '提交中' : '重试'}</button>
            : <small>请在对话中查看处理建议（未扣费）</small>}
      </div>}
      {item.agentOrigin && item.agentOrigin.attemptNumber > 1 && <span className="agent-retry-origin">原任务第 {item.agentOrigin.slotIndex} 张 · 第 {item.agentOrigin.attemptNumber} 次尝试</span>}
      {selected && multi && <b className="ck"><Icon name="check" size={11} /></b>}
      {overlay?.kind === 'frame-out' && (
        <i className="ov-out" style={frameOut(item.image.width / item.image.height, overlay.ratio)}>
          <span>{ratioLabel(overlay.ratio)}</span>
        </i>
      )}
      {item.locked && <span style={{ position: 'absolute', left: 6, top: 6, color: '#fff', opacity: .8 }}><Icon name="lock" size={12} /></span>}
    </div>
  )
}

/** 多卡错相：按 item.id 哈希出 0–3.8s 的负延迟，同批占位的柔光不同步。 */
const ratioLabel = (r: number) => ({ 1: '1:1', 0.75: '3:4', 1.3333: '4:3', 0.5625: '9:16', 1.7778: '16:9' } as Record<number, string>)[Math.round(r * 10000) / 10000] ?? ''

/** 扩图目标框：包住原图，按目标比例向外扩 */
function frameOut(imgR: number, r: number): React.CSSProperties {
  if (Math.abs(r - imgR) < 0.01) return { left: '-6%', top: `${-6 * imgR}%`, width: '112%', height: `${100 + 12 * imgR}%` }
  if (r > imgR) { const w = (r / imgR) * 100; return { left: `${-(w - 100) / 2}%`, top: 0, width: `${w}%`, height: '100%' } }
  const h = (imgR / r) * 100; return { left: 0, top: `${-(h - 100) / 2}%`, width: '100%', height: `${h}%` }
}
/** 裁剪框：在原图内按比例取最大框，框外压暗 */
function frameIn(imgR: number, r: number): React.CSSProperties {
  if (r > imgR) { const h = (imgR / r) * 100; return { left: 0, top: `${(100 - h) / 2}%`, width: '100%', height: `${h}%` } }
  const w = (r / imgR) * 100; return { left: `${(100 - w) / 2}%`, top: 0, width: `${w}%`, height: '100%' }
}

/** Preview keeps the existing blue brush; export is black/white at native pixels. */
function MaskLayer({ image, brush, clearKey, onMask }: { image: ImageRef; brush: number; clearKey: number; onMask: (has: boolean, dataUrl?: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    c.width = image.width; c.height = image.height
    last.current = null
    onMask(false)
    // Browser natural dimensions include EXIF orientation. Never export the
    // thumbnail or CSS-sized overlay as the hard-mask coordinate system.
    const original = new Image()
    let alive = true
    original.onload = () => {
      if (!alive || !original.naturalWidth || !original.naturalHeight) return
      if (c.width !== original.naturalWidth || c.height !== original.naturalHeight) {
        c.width = original.naturalWidth; c.height = original.naturalHeight
        onMask(false)
      }
    }
    original.src = image.url
    return () => { alive = false }
  }, [clearKey, image.width, image.height, image.url, onMask])
  const at = (e: React.PointerEvent) => {
    const c = ref.current!; const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, k: c.width / r.width }
  }
  const draw = (e: React.PointerEvent) => {
    const c = ref.current!; const g = c.getContext('2d')!; const pt = at(e)
    g.strokeStyle = '#339cff'; g.fillStyle = '#339cff'; g.lineCap = 'round'; g.lineJoin = 'round'
    g.lineWidth = brush * pt.k
    g.beginPath()
    if (last.current) { g.moveTo(last.current.x, last.current.y); g.lineTo(pt.x, pt.y); g.stroke() }
    else { g.arc(pt.x, pt.y, (brush * pt.k) / 2, 0, Math.PI * 2); g.fill() }
    last.current = pt
  }
  return (
    <canvas
      ref={ref}
      className="ov-mask nodrag nopan"
      style={{ cursor: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${brush + 2}' height='${brush + 2}'><circle cx='${brush / 2 + 1}' cy='${brush / 2 + 1}' r='${brush / 2}' fill='none' stroke='white' stroke-width='1.5'/></svg>`)}") ${brush / 2 + 1} ${brush / 2 + 1}, crosshair` }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); last.current = null; draw(e); onMask(true) }}
      onPointerMove={(e) => { if (e.buttons & 1) draw(e) }}
      onPointerUp={() => {
        last.current = null
        const source = ref.current
        if (!source) return
        const output = document.createElement('canvas')
        output.width = source.width; output.height = source.height
        const context = output.getContext('2d')
        if (!context) return
        context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height)
        context.globalCompositeOperation = 'destination-in'; context.drawImage(source, 0, 0)
        context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#000'; context.fillRect(0, 0, output.width, output.height)
        onMask(true, output.toDataURL('image/png'))
      }}
    />
  )
}

export const ImageNode = memo(ImageNodeImpl)
export const nodeTypes = { img: ImageNode }
