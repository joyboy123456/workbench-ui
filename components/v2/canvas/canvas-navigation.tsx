'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MiniMap, Panel, useReactFlow, useStore, useStoreApi, type Node } from '@xyflow/react'
import type { ArrangeMode, CanvasItem } from '@/lib/v2/types'
import { canvasMotionDuration, canvasViewport, isCanvasInput } from '@/lib/v2/fit'
import { usableImage } from '@/lib/v2/selection-actions'
import { Icon } from '../icons'
import { useDismiss } from '../ui'

const miniMapNodeColor = (node: Node) => node.selected ? 'var(--acc)' : 'var(--tx3)'

export function CanvasViewButtons({ mapOpen, onFit, onMap }: { mapOpen: boolean; onFit: () => void; onMap: () => void }) {
  return <>
    <button type="button" title="显示全部 Shift 1" aria-label="显示全部" onClick={onFit}><Icon name="fit" size={17} /></button>
    <button type="button" title="预览 · 小地图" aria-label="预览小地图" aria-pressed={mapOpen} onClick={onMap}><Icon name="minimap" size={17} /></button>
  </>
}

export function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (zoom: number) => void }) {
  const percent = Math.round(zoom * 100)
  const [draft, setDraft] = useState(String(percent))
  const skipBlur = useRef(false)
  useEffect(() => { setDraft(String(percent)) }, [percent])
  const commit = () => {
    const value = Number(draft)
    if (!draft.trim() || !Number.isFinite(value)) { setDraft(String(percent)); return }
    const next = Math.max(2, Math.min(400, value))
    setDraft(String(next))
    if (next !== percent) onZoom(next / 100)
  }
  return <>
    <button type="button" aria-label="缩小" title="缩小 Ctrl / ⌘ −" disabled={percent <= 2} onClick={() => onZoom(Math.max(.02, zoom / 1.2))}><Icon name="minus" size={17} /></button>
    <input className="nav-zoom-slider nodrag nowheel" type="range" min={2} max={400} step={1} value={percent} aria-label="缩放滑杆" onChange={event => onZoom(Number(event.target.value) / 100)} />
    <label className="nav-zoom-input"><input type="number" aria-label="缩放百分比" min={2} max={400} step={1} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (skipBlur.current) skipBlur.current = false; else commit() }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Enter') { event.preventDefault(); commit() }
      if (event.key === 'Escape') { skipBlur.current = true; setDraft(String(percent)); event.currentTarget.blur() }
    }} /><span>%</span></label>
    <button type="button" aria-label="放大" title="放大 Ctrl / ⌘ +" disabled={percent >= 400} onClick={() => onZoom(Math.min(4, zoom * 1.2))}><Icon name="plus" size={17} /></button>
  </>
}

export interface ArrangeOptionsProps {
  items: CanvasItem[]
  selected: string[]
  cols: number
  onCols: (cols: number) => void
  onArrange: (mode: ArrangeMode) => void
}

/** 共用 React Flow 视口，分类标题只参与边界计算，不生成额外节点。 */
export function useCanvasFit(drawerOpen = false) {
  const rf = useReactFlow()
  const store = useStoreApi()
  return useCallback((items: CanvasItem[], selection = false, duration = 300) => {
    const { width, height } = store.getState()
    const viewport = canvasViewport(items, width, height, drawerOpen, selection)
    if (viewport) void rf.setViewport(viewport, { duration: canvasMotionDuration(duration) })
  }, [rf, store, drawerOpen])
}

/** 同一套选项用于常驻整理入口和空白处右键菜单。列数直接可调，无悬停子菜单。 */
export function ArrangeOptions({ items, selected, cols, onCols, onArrange }: ArrangeOptionsProps) {
  const colsId = useId()
  const target = selected.length > 1 ? items.filter(item => selected.includes(item.id)) : items
  const movable = target.filter(item => !item.locked).length
  const modes = [
    { id: 'grid', icon: 'grid', name: '网格', hint: '等宽列，整齐对比' },
    { id: 'masonry', icon: 'fall', name: '瀑布流', hint: '保留比例，紧凑浏览' },
    { id: 'category', icon: 'categories', name: '按类别', hint: '商品 / 模特 / 结果 / 素材' },
    { id: 'time', icon: 'hist', name: '按时间', hint: '从早到晚，未知时间置后' },
  ] satisfies { id: ArrangeMode; icon: string; name: string; hint: string }[]
  return (
    <div className="arrange-options" role="group" aria-label="整理布局">
      <div className="arrange-heading">{selected.length > 1 ? `整理所选 ${target.length} 张` : `整理全部 ${target.length} 张`}<span>可撤销</span></div>
      <div className="arrange-cols"><label htmlFor={colsId}>列数</label>
        <span>
          <button aria-label="减少列数" disabled={cols <= 1} onClick={() => onCols(Math.max(1, cols - 1))}>−</button>
          <input id={colsId} type="number" min={1} max={24} value={cols} onChange={e => onCols(Math.max(1, Math.min(24, Math.floor(Number(e.target.value) || 1))))} />
          <button aria-label="增加列数" disabled={cols >= 24} onClick={() => onCols(Math.min(24, cols + 1))}>+</button>
        </span>
      </div>
      {modes.map(mode => <button key={mode.id} className="arrange-mode" disabled={!movable} onClick={() => onArrange(mode.id)}>
        <Icon name={mode.icon} size={18} /><span>{mode.name}<small>{mode.hint}</small></span>
      </button>)}
      <p className="arrange-footnote">{!target.length ? '添加图片后即可整理' : `${movable} 张可移动${target.length > movable ? ` · ${target.length - movable} 张已锁定` : ''} · Ctrl / ⌘ Z 撤销`}</p>
    </div>
  )
}

const CANVAS_BG_SWATCHES = [
  { color: null, label: '默认浅灰', preview: '#f5f5f6' },
  { color: '#e5e5e7', label: '柔和雾灰', preview: '#e5e5e7' },
  { color: '#c8c8cc', label: '中性灰', preview: '#c8c8cc' },
  { color: '#65656a', label: '中深灰', preview: '#65656a' },
  { color: '#3c3c40', label: '深炭灰', preview: '#3c3c40' },
  { color: '#161618', label: '纯暗夜', preview: '#161618' },
] as const

export function CanvasNavigation(props: ArrangeOptionsProps & { drawerOpen?: boolean; canvasBg?: string | null; onCanvasBg?: (color: string | null) => void; active: boolean; onPreview: (id: string) => void; onDownload: (ids: string[]) => void }) {
  const rf = useReactFlow()
  const fitItems = useCanvasFit(props.drawerOpen)
  const zoom = useStore(state => state.transform[2])
  const [view, setView] = useState<'map' | 'files' | null>(null)
  const mapOpen = view === 'map'
  const results = view === 'files' ? props.items.filter(item => item.ref.type === 'generation' && usableImage(item)) : []
  const filesId = useId()
  const filesClose = useRef<HTMLButtonElement>(null)
  const filesTrigger = useRef<HTMLButtonElement>(null)
  const closeFiles = useCallback(() => {
    setView(null)
    requestAnimationFrame(() => filesTrigger.current?.focus({ preventScroll: true }))
  }, [])
  useEffect(() => {
    if (view === 'files') filesClose.current?.focus({ preventScroll: true })
  }, [view])
  const [open, setOpen] = useState(false)
  const optionsId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeOptions = useCallback(() => {
    if (ref.current?.contains(document.activeElement)) trigger.current?.focus()
    setOpen(false)
  }, [])
  useDismiss(open, closeOptions, ref)
  const [bgOpen, setBgOpen] = useState(false)
  const bgId = useId()
  const bgRef = useRef<HTMLDivElement>(null)
  const bgTrigger = useRef<HTMLButtonElement>(null)
  const closeBg = useCallback(() => {
    if (bgRef.current?.contains(document.activeElement)) bgTrigger.current?.focus()
    setBgOpen(false)
  }, [])
  useDismiss(bgOpen, closeBg, bgRef)
  const fit = useCallback((selection: boolean) => {
    if (selection && !props.selected.length) return
    fitItems(selection ? props.items.filter(item => props.selected.includes(item.id)) : props.items, selection)
  }, [fitItems, props.items, props.selected])
  useEffect(() => {
    if (!props.active) return
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isCanvasInput(event.target) || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.code === 'Digit1' || event.code === 'Digit2') {
        event.preventDefault()
        fit(event.code === 'Digit2')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [fit, props.active])

  return <>
    {mapOpen && <Panel position="bottom-right" className={'canvas-map-panel' + (props.drawerOpen ? ' drawer-open' : '')}>
      <div className="canvas-map-heading"><span>画布概览</span><span>{props.items.length} 张</span></div>
      <MiniMap className="canvas-minimap" ariaLabel="画布小地图，拖动以移动视口" pannable zoomable nodeColor={miniMapNodeColor} nodeStrokeColor="var(--line2)" nodeBorderRadius={0}
        maskColor="rgba(18, 18, 18, 0.7)" maskStrokeColor="var(--acc)" maskStrokeWidth={1.5} />
      <p>{props.items.length ? '拖动概览移动视口' : '添加图片后在此查看位置'}</p>
    </Panel>}
    {view === 'files' && <Panel position="top-right" className="canvas-generated-files nodrag nopan">
      <section id={filesId} aria-label="生成文件列表" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); closeFiles() }
      }}>
        <header>
          <h2>生成文件</h2>
          <button ref={filesClose} type="button" title="关闭生成文件" aria-label="关闭生成文件" onClick={closeFiles}><Icon name="x" size={18} /></button>
        </header>
        <div className="canvas-file-list nowheel">
          {results.map((item, index) => {
            const label = `生成图片 ${index + 1}`
            return <div className="canvas-file-row" key={item.id}>
              <button type="button" className="canvas-file-preview" title={`预览${label}`} onClick={() => props.onPreview(item.id)}>
                <img src={item.image.thumbUrl ?? item.image.url} alt="" loading="lazy" draggable={false} />
                <span>{label}</span>
              </button>
              <button type="button" className="canvas-file-download" title="下载" aria-label={`下载${label}`} onClick={() => props.onDownload([item.id])}><Icon name="dl" size={17} /></button>
            </div>
          })}
          <p>{results.length ? '到底了' : '当前画布暂无生成文件'}</p>
        </div>
      </section>
    </Panel>}
    <Panel position="bottom-right" className={'canvas-navigation' + (view === 'files' ? ' files-open' : '') + (props.drawerOpen ? ' drawer-open' : '')}>
      <div className="canvas-view-actions" role="group" aria-label="画布导航">
        {props.onCanvasBg && (
          <div ref={bgRef} className="canvas-bg-control">
            <button
              ref={bgTrigger}
              type="button"
              title="画布背景色"
              aria-label="画布背景色"
              aria-expanded={bgOpen}
              aria-controls={bgOpen ? bgId : undefined}
              onClick={() => { setOpen(false); setBgOpen(value => !value) }}
            >
              <span
                className={'canvas-bg-dot' + (props.canvasBg ? ' filled' : '')}
                style={props.canvasBg ? { background: props.canvasBg } : undefined}
                aria-hidden
              >
                {!props.canvasBg && <Icon name="circle" size={16} />}
              </span>
            </button>
            {bgOpen && (
              <div id={bgId} className="canvas-bg-menu" role="group" aria-label="画布背景色板">
                <div className="canvas-bg-title">画布背景</div>
                <div className="canvas-bg-swatches">
                  {CANVAS_BG_SWATCHES.map(swatch => (
                    <button
                      key={swatch.label}
                      type="button"
                      className={'canvas-bg-swatch' + ((props.canvasBg ?? null) === swatch.color ? ' on' : '')}
                      style={{ background: swatch.preview }}
                      title={swatch.label}
                      aria-label={swatch.label}
                      aria-pressed={(props.canvasBg ?? null) === swatch.color}
                      onClick={() => { props.onCanvasBg?.(swatch.color); setBgOpen(false) }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={ref} className="canvas-arrange-control">
          <button ref={trigger} type="button" className={open ? 'on' : ''} title="整理布局" aria-label="整理布局" aria-expanded={open} aria-controls={open ? optionsId : undefined} onClick={() => { setBgOpen(false); setOpen(!open) }}>
            <Icon name="grid" size={16} />
          </button>
          {open && <div id={optionsId} className="canvas-layout-menu">
            <ArrangeOptions {...props} onArrange={mode => { props.onArrange(mode); closeOptions() }} />
          </div>}
        </div>
        <CanvasViewButtons mapOpen={mapOpen} onFit={() => fit(false)} onMap={() => setView(mapOpen ? null : 'map')} />
        <button ref={filesTrigger} type="button" title="生成文件" aria-label="生成文件" aria-expanded={view === 'files'} aria-controls={view === 'files' ? filesId : undefined}
          onClick={() => setView(view === 'files' ? null : 'files')}><Icon name="doc" size={17} /></button>
        <span className="canvas-nav-divider" aria-hidden="true" />
        <ZoomControls zoom={zoom} onZoom={zoom => { void rf.zoomTo(zoom, { duration: 0 }) }} />
      </div>
    </Panel>
  </>
}
