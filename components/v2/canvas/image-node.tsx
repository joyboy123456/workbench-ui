'use client'
import { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import type { CanvasItem, ImageRef } from '@/lib/v2/types'
import { Icon } from '../icons'
import { useToast } from '../ui'
import { GenerationArtwork, useGenerationState } from './generation-state'

/** 工具面板打开时画在图上的叠层 */
export type NodeOverlay =
  | { kind: 'mask'; brush: number; clearKey: number; onMask: (has: boolean, dataUrl?: string) => void }
  | { kind: 'frame-out' | 'frame-in'; ratio: number }
  | { kind: 'filter'; css: string }
export type ImageNodeData = { item: CanvasItem; multi: boolean; overlay?: NodeOverlay; onRetry?: (runId: string) => void | Promise<void> }
export type ImageNodeType = Node<ImageNodeData, 'img'>

/** A fixed output frame survives every lifecycle change; only its contents change. */
function ImageNodeImpl({ data, selected }: NodeProps<ImageNodeType>) {
  const { item, multi, overlay, onRetry } = data
  const { display, variant } = useGenerationState(item)
  const toast = useToast()
  const running = item.status === 'running'
  const failed = item.status === 'failed'
  const [loadedUrl, setLoadedUrl] = useState('')
  const [failedUrl, setFailedUrl] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [retrying, setRetrying] = useState(false)
  useEffect(() => { setRetrying(false) }, [item.status, item.startedAt, item.toolRunId])
  const src = item.image.thumbUrl ?? item.image.url
  const hasImg = Boolean(item.image.url && !running && !failed)
  const loadingImage = hasImg && loadedUrl !== src && failedUrl !== src
  const loading = running || loadingImage
  const loadFailed = hasImg && failedUrl === src
  const size = item.targetSize ?? item.image
  const pctLabel = loadingImage ? '99%' : display.percent !== undefined ? `${display.percent}%` : '0%'
  const stageLabel = loadingImage
    ? '载入中'
    : item.generationPhase === 'queued'
      ? '排队中'
      : item.generationPhase === 'processing'
        ? '载入中'
        : item.generationPhase === 'unconfirmed'
          ? '确认中'
          : '生成中'
  return (
    <div
      className={
        'node' +
        (hasImg && loadedUrl === src ? ' reveal' : '') +
        (selected && !multi ? ' sel' : '') +
        (failed || loadFailed ? ' failed' : '') +
        (loading ? ` gen phase-${item.generationPhase ?? 'processing'}` : '') +
        (item.targetSize ? ' fixed-frame' : '')
      }
      style={{ width: '100%', height: '100%' }}
      data-generation-state={failed || loadFailed ? 'failed' : loadingImage ? 'processing' : item.status === 'done' ? 'done' : item.generationPhase}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="provenance-port" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="provenance-port" />
      {hasImg && <img key={`${src}:${loadAttempt}`} src={src} alt="" draggable={false}
        className={loadedUrl === src ? 'result-loaded' : 'result-loading'}
        onLoad={() => { setLoadedUrl(src); setFailedUrl('') }} onError={() => setFailedUrl(src)}
        style={overlay?.kind === 'filter' ? { filter: overlay.css } : undefined} />}
      {overlay?.kind === 'mask' && <MaskLayer image={item.image} brush={overlay.brush} clearKey={overlay.clearKey} onMask={overlay.onMask} />}
      {overlay?.kind === 'frame-in' && <i className="ov-crop" style={frameIn(item.image.width / item.image.height, overlay.ratio)} />}
      {loading && <>
        <GenerationArtwork variant={variant} />
        <span className="gen-pill tnum" role="status" aria-label={`进度 ${pctLabel}`}><i aria-hidden />{pctLabel}</span>
        <span className="gen-stage-pill" role="status">{stageLabel}</span>
        <div className="generation-caption">
          {running && display.percent !== undefined && <progress aria-label={display.estimated ? '图片生成估算进度' : '图片生成进度'} value={display.percent} max={100} />}
          <span>目标 {size.width} × {size.height}</span>
        </div>
      </>}
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
            try { await onRetry(item.toolRunId) }
            catch (error) { toast(error instanceof Error ? error.message : '重试提交未能确认，请查询原任务') }
            finally { setRetrying(false) }
          }}><Icon name="retry" size={12} />{retrying ? '提交中' : '重试'}</button>
            : <small>请在对话中查看处理建议（未扣费）</small>}
      </div>}
      {selected && multi && <b className="ck"><Icon name="check" size={11} /></b>}
      {selected && !multi && (
        <>
          <i className="hdl" style={{ left: -3.25, top: -3.25 }} />
          <i className="hdl" style={{ right: -3.25, top: -3.25 }} />
          <i className="hdl" style={{ left: -3.25, bottom: -3.25 }} />
          <i className="hdl" style={{ right: -3.25, bottom: -3.25 }} />
        </>
      )}
      {overlay?.kind === 'frame-out' && (
        <i className="ov-out" style={frameOut(item.image.width / item.image.height, overlay.ratio)}>
          <span>{ratioLabel(overlay.ratio)}</span>
        </i>
      )}
      {item.locked && <span style={{ position: 'absolute', left: 6, top: 6, color: '#fff', opacity: .8 }}><Icon name="lock" size={12} /></span>}
    </div>
  )
}

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
