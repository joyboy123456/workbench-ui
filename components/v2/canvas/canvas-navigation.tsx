'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MiniMap, Panel, useReactFlow, useStore, useStoreApi, type Node } from '@xyflow/react'
import type { ArrangeMode, CanvasItem } from '@/lib/v2/types'
import { canvasMotionDuration, canvasViewport, isCanvasInput } from '@/lib/v2/fit'
import { Icon } from '../icons'
import { useDismiss } from '../ui'

const miniMapNodeColor = (node: Node) => node.selected ? 'var(--acc)' : 'var(--tx3)'

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

export function CanvasNavigation(props: ArrangeOptionsProps & { drawerOpen?: boolean; active: boolean }) {
  const rf = useReactFlow()
  const fitItems = useCanvasFit(props.drawerOpen)
  const zoom = useStore(state => state.transform[2])
  const [mapOpen, setMapOpen] = useState(true)
  const [open, setOpen] = useState(false)
  const optionsId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeOptions = useCallback(() => {
    if (ref.current?.contains(document.activeElement)) trigger.current?.focus()
    setOpen(false)
  }, [])
  useDismiss(open, closeOptions, ref)
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
    <Panel position="top-left" className="canvas-layout-control">
      <div ref={ref}>
        <button ref={trigger} className={'canvas-layout-trigger' + (open ? ' on' : '')} aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen(!open)}>
          <Icon name="grid" size={16} />整理<Icon name="chev" size={12} />
        </button>
        {open && <div id={optionsId} className="canvas-layout-menu">
          <ArrangeOptions {...props} onArrange={mode => { props.onArrange(mode); closeOptions() }} />
        </div>}
      </div>
    </Panel>
    {mapOpen && <Panel position="bottom-right" className={'canvas-map-panel' + (props.drawerOpen ? ' drawer-open' : '')}>
      <div className="canvas-map-heading"><span>画布概览</span><span>{props.items.length} 张</span></div>
      <MiniMap className="canvas-minimap" ariaLabel="画布小地图，拖动以移动视口" pannable zoomable nodeColor={miniMapNodeColor} nodeStrokeColor="var(--line2)" nodeBorderRadius={0}
        maskColor="rgba(18, 18, 18, 0.7)" maskStrokeColor="var(--acc)" maskStrokeWidth={1.5} />
      <p>{props.items.length ? '拖动概览移动视口' : '添加图片后在此查看位置'}</p>
    </Panel>}
    <Panel position="bottom-right" className={'canvas-navigation' + (props.drawerOpen ? ' drawer-open' : '')}>
      <div className="canvas-view-actions" role="toolbar" aria-label="画布导航">
        <button title="展示全部 · Shift+1" aria-label="展示全部" aria-keyshortcuts="Shift+1" onClick={() => fit(false)}><Icon name="fit" size={16} /><span>全部</span></button>
        <button title="定位到选中 · Shift+2" aria-label="定位到选中" aria-keyshortcuts="Shift+2" disabled={!props.selected.length} onClick={() => fit(true)}><Icon name="fit-selection" size={16} /></button>
        <button title="显示小地图" aria-label="显示小地图" aria-pressed={mapOpen} onClick={() => setMapOpen(!mapOpen)}><Icon name="minimap" size={16} /></button>
      </div>
      <div className="canvas-zoom-actions" role="toolbar" aria-label="画布缩放">
        <button aria-label="缩小" title="缩小" disabled={zoom <= .02} onClick={() => rf.zoomOut({ duration: canvasMotionDuration(150) })}>−</button>
        <button className="canvas-zoom-value" title="重置到 100%" aria-label={`当前缩放 ${Math.round(zoom * 100)}%，点击重置到 100%`} onClick={() => rf.zoomTo(1, { duration: canvasMotionDuration(150) })}>{Math.round(zoom * 100)}%</button>
        <button aria-label="放大" title="放大" disabled={zoom >= 4} onClick={() => rf.zoomIn({ duration: canvasMotionDuration(150) })}>+</button>
      </div>
    </Panel>
  </>
}
