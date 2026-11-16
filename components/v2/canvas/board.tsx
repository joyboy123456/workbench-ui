'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, NodeToolbar, Position, ReactFlow, ViewportPortal, applyNodeChanges, useReactFlow,
  SelectionMode, type Edge, type NodeChange,
} from '@xyflow/react'
import { arrange, itemHeight, layoutSections } from '@/lib/v2/arrange'
import { pasteCanvasItems, reorderCanvasItems, selectionTools, usableImage } from '@/lib/v2/selection-actions'
import { generationToolParameters } from '@/lib/v2/generation-history'
import { ancestorLayers, parentIds, provenanceLinks } from '@/lib/v2/provenance'
import { canvasFitPad, canvasMotionDuration } from '@/lib/v2/fit'
import type { ArrangeMode, CanvasItem, ToolDef, ToolParams } from '@/lib/v2/types'
import { Icon } from '../icons'
import { FloatingMenu, useToast } from '../ui'
import { SelectionToolbar } from './selection-toolbar'
import { nodeTypes, type ImageNodeType, type NodeOverlay } from './image-node'
import { ToolPanel, defaultParams, filterCss, ratioOf } from './tool-panel'
import { ArrangeOptions, CanvasNavigation, useCanvasFit } from './canvas-navigation'

export interface BoardProps {
  items: CanvasItem[]
  selected: string[]
  tool: 'select' | 'hand'
  active: boolean
  drawerOpen?: boolean
  onBeginMove: () => void
  onEndMove: () => void
  tools: ToolDef[]
  onItems: (next: CanvasItem[], commit: boolean) => void
  onSelect: (ids: string[]) => void
  onRunTool: (toolId: string, ids: string[], params?: ToolParams) => void
  onRetryTool?: (runId: string) => void | Promise<void>
  onAddToChat: (ids: string[]) => void
  onDownload: (ids: string[]) => void
  onSaveMaterial: (ids: string[]) => void
  onSetCover: (id: string) => void
  onPreview: (id: string) => void
  onDropAsset: (raw: string, at: { x: number; y: number }) => void
  onDropFiles: (files: File[], at: { x: number; y: number }) => void
  onUpload: () => void
  /** 工具广场入口；历史入口 previewOnly 只打开面板，确认后才提交 */
  autoTool?: { toolId: string; itemId: string; params?: ToolParams; previewOnly?: boolean } | null
}

type Menu = null | { kind: 'node'; id: string; x: number; y: number } | { kind: 'pane'; x: number; y: number } | { kind: 'more' | 'options'; id: string; x: number; y: number; toolId?: string; trigger?: HTMLButtonElement }

export function Board(p: BoardProps) {
  const rf = useReactFlow()
  const toast = useToast()
  const stage = useRef<HTMLDivElement>(null)
  const clipboard = useRef<CanvasItem[]>([])
  const fitItems = useCanvasFit(p.drawerOpen)
  const [menu, setMenu] = useState<Menu>(null)
  const [cols, setCols] = useState(5)
  const [dragOver, setDragOver] = useState(false)
  const [panel, setPanel] = useState<string | null>(null)
  const [historyTool, setHistoryTool] = useState<ToolDef | null>(null)
  const [params, setParams] = useState<ToolParams>({})
  const [hasMask, setHasMask] = useState(false)
  const maskDataUrl = useRef<string | undefined>(undefined)
  const onMask = useCallback((has: boolean, dataUrl?: string) => { setHasMask(has); maskDataUrl.current = dataUrl }, [])
  const [maskKey, setMaskKey] = useState(0)
  const [arranging, setArranging] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [showConnections, setShowConnections] = useState(false)
  const [trace, setTrace] = useState<{ id: string; step: number } | null>(null)
  const sourceTrigger = useRef<HTMLElement | null>(null)
  const sourceClose = useRef<HTMLButtonElement | null>(null)
  const connectionsToggle = useRef<HTMLButtonElement | null>(null)
  const traceId = trace?.id
  const links = useMemo(() => provenanceLinks(p.items), [p.items])
  const layers = useMemo(() => traceId ? ancestorLayers(p.items, traceId) : [], [p.items, traceId])
  const traceStep = Math.min(trace?.step ?? 0, Math.max(0, layers.length - 1))
  const traceLayer = useMemo(() => new Set(layers[traceStep] ?? []), [layers, traceStep])
  const traceIds = useMemo(() => new Set(traceId ? [traceId, ...layers.flat()] : []), [traceId, layers])
  const selectedKey = p.selected.join('\0')
  const closeSources = useCallback(() => {
    setTrace(null)
    const trigger = sourceTrigger.current
    ;(trigger?.isConnected ? trigger : connectionsToggle.current)?.focus({ preventScroll: true })
  }, [])
  useEffect(() => { setTrace(null) }, [selectedKey])
  useEffect(() => {
    if (!traceId) return
    sourceClose.current?.focus({ preventScroll: true })
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') closeSources() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [traceId, closeSources])
  const viewSources = (id: string, trigger: HTMLElement) => {
    sourceTrigger.current = trigger
    setMenu(null); setPanel(null)
    setTrace({ id, step: 0 })
    const ancestors = ancestorLayers(p.items, id).flat()
    if (!ancestors.length) return
    const ids = [id, ...ancestors]
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    void rf.fitView({ nodes: ids.map(id => ({ id })), padding: panePad, duration: reduced ? 0 : 300, maxZoom: 1 })
  }
  const edges: Edge[] = !showConnections && !trace ? [] : links
    .filter(link => !trace || traceIds.has(link.source) && traceIds.has(link.target))
    .map(link => ({ ...link, type: 'default', selectable: false, focusable: false, interactionWidth: 0,
      className: 'provenance-edge' + (trace ? (traceLayer.has(link.source) ? ' is-related' : ' is-muted')
        : p.selected.length ? (p.selected.includes(link.source) || p.selected.includes(link.target) ? ' is-related' : ' is-muted') : ''),
    }))
  const arrangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const multi = p.selected.length > 1
  const selectionKey = p.selected.join('\0')
  const sel = useMemo(() => new Set(p.selected), [selectionKey])
  const selectedItems = p.items.filter(i => sel.has(i.id))
  const readyIds = selectedItems.filter(usableImage).map(i => i.id)
  const actions = selectionTools(p.tools)

  useEffect(() => () => { if (arrangeTimer.current) clearTimeout(arrangeTimer.current) }, [])
  useEffect(() => { setPanel(null); setHasMask(false); maskDataUrl.current = undefined }, [selectionKey])
  const sections = useMemo(() => layoutSections(p.items), [p.items])
  const panePad = canvasFitPad(p.drawerOpen)
  const initialFit = useRef(false)

  useEffect(() => {
    if (!rf.viewportInitialized || !p.items.length || initialFit.current) return
    const frame = requestAnimationFrame(() => { fitItems(p.items, false, 0); initialFit.current = true })
    return () => cancelAnimationFrame(frame)
  }, [rf.viewportInitialized, p.items, fitItems])
  useEffect(() => {
    if (!panel) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [panel])

  const panelDef = panel ? historyTool?.id === panel ? historyTool : p.tools.find((t) => t.id === panel) : undefined
  const overlay: NodeOverlay | undefined = useMemo(() => {
    if (!panelDef?.overlay) return undefined
    if (panelDef.overlay === 'mask') return { kind: 'mask', brush: Number(params.brush ?? 24), clearKey: maskKey, onMask }
    if (panelDef.overlay === 'filter') return { kind: 'filter', css: filterCss(params) }
    const r = ratioOf(params, panelDef)
    return r ? { kind: panelDef.overlay, ratio: r } : undefined
  }, [panelDef, params, maskKey, onMask])
  const openTool = (t: ToolDef, id: string) => {
    setMenu(null)
    setHistoryTool(null)
    setTrace(null)
    if (t.fields?.length) {
      if (panel === t.id) { setPanel(null); return }
      setParams(defaultParams(t)); setHasMask(false); maskDataUrl.current = undefined; setMaskKey((k) => k + 1); setPanel(t.id)
    } else { setPanel(null); p.onRunTool(t.id, [id]) }
  }

  useEffect(() => {
    const a = p.autoTool
    if (!a) return
    const [base, option] = a.toolId.split(':')
    const t = p.tools.find((x) => x.id === base)
    if (!t || !p.items.some((i) => i.id === a.itemId)) return
    if (a.previewOnly) {
      // History navigation must never execute a no-parameter tool on mount.
      setMenu(null); setHasMask(false); maskDataUrl.current = undefined; setMaskKey(k => k + 1)
      setHistoryTool({ ...t, tip: '历史参数已带入。请确认参考图片与参数，再点击生成。',
        fields: t.options ? [{ id: 'historyOption', label: '处理规格', kind: 'segment', options: t.options, default: option ?? t.options[0]?.id }] : t.fields })
      setParams({ ...generationToolParameters(t, a.params), ...(t.options ? { historyOption: option ?? t.options[0]?.id } : {}) })
      setPanel(t.id)
    } else {
      openTool(t, a.itemId)
      if (a.params) setParams({ ...defaultParams(t), ...a.params })
    }
  }, [p.autoTool])

  const nodes: ImageNodeType[] = useMemo(() => p.items.map((i, index) => {
    const h = itemHeight(i)
    return {
      id: i.id,
      type: 'img' as const,
      className: trace ? (traceLayer.has(i.id) ? 'provenance-current' : traceIds.has(i.id) ? 'provenance-chain' : 'provenance-muted') : undefined,
      position: { x: i.x, y: i.y },
      data: { item: i, multi, onRetry: p.onRetryTool, overlay: panel && p.selected.length === 1 && p.selected[0] === i.id ? overlay : undefined },
      zIndex: panel && p.selected[0] === i.id ? p.items.length + 1 : index,
      selected: sel.has(i.id),
      draggable: !i.locked && p.tool === 'select' && !arranging,
      style: { width: i.w, height: h },
      width: i.w,
      height: h,
      measured: { width: i.w, height: h },
    }
  }), [p.items, p.selected, multi, p.tool, p.onRetryTool, panel, overlay, trace, traceLayer, traceIds, arranging])

  const onNodesChange = useCallback((changes: NodeChange<ImageNodeType>[]) => {
    const next = applyNodeChanges(changes, nodes)
    const pos = new Map(next.map((n) => [n.id, n.position]))
    const moved = changes.some((c) => c.type === 'position')
    const removed = changes.some((c) => c.type === 'remove')
    if (moved || removed) {
      const dragging = changes.some((c) => c.type === 'position' && c.dragging)
      p.onItems(p.items.filter((i) => pos.has(i.id)).map((i) => {
        const at = pos.get(i.id)!
        return at.x === i.x && at.y === i.y ? i : { ...i, x: at.x, y: at.y }
      }), removed || !dragging)
    }
    if (changes.some((c) => c.type === 'select')) {
      const ids = next.filter((n) => n.selected).map((n) => n.id)
      if (ids.join('|') !== p.selected.join('|')) p.onSelect(ids)
    }
  }, [nodes, p])

  const one = p.selected.length === 1 ? p.items.find((i) => i.id === p.selected[0]) : undefined
  const copy = (event?: ClipboardEvent) => {
    clipboard.current = structuredClone(selectedItems.filter(usableImage))
    if (clipboard.current.length) {
      // Put a text marker on the native clipboard so a previous system image
      // cannot take precedence over a fresh canvas copy on Ctrl+V.
      if (event?.clipboardData) event.clipboardData.setData('text/plain', 'V2 画布图片')
      else if (navigator.clipboard) void navigator.clipboard.writeText('V2 画布图片').catch(() => toast('已复制到画布，右键空白处可粘贴'))
    }
    toast(clipboard.current.length ? `已复制 ${clipboard.current.length} 张，按 Ctrl+V 粘贴` : '请先选择已完成的图片')
  }
  const paste = (at?: { x: number; y: number }) => {
    const added = pasteCanvasItems(clipboard.current, p.items, () => `ci_${crypto.randomUUID()}`, at)
    if (!added.length) { toast('请先复制画布图片，系统图片请用 Ctrl+V 粘贴'); return }
    p.onItems([...p.items, ...added], true)
    p.onSelect(added.map(i => i.id)); setMenu(null)
    toast(`已粘贴 ${added.length} 张`)
  }
  const remove = (ids: string[]) => {
    p.onItems(p.items.filter(i => !ids.includes(i.id)), true)
    p.onSelect(p.selected.filter(id => !ids.includes(id))); setMenu(null); setPanel(null)
    toast(`已删除 ${ids.length} 张`)
  }
  const openAction = (def: ToolDef, id: string, at: { x: number; y: number }, trigger?: HTMLButtonElement) => {
    if (def.options?.length) { setPanel(null); setMenu({ kind: 'options', id, ...at, toolId: def.id, trigger }) }
    else openTool(def, id)
  }
  useEffect(() => {
    if (p.active === false) return
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
    const key = (event: KeyboardEvent) => {
      if (editable(event.target) || event.defaultPrevented) return
      if (event.key === 'Escape') { setMenu(null); setPanel(null); p.onSelect([]); stage.current?.focus({ preventScroll: true }) }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && p.selected.length) { event.preventDefault(); remove(p.selected) }
    }
    const copied = (event: ClipboardEvent) => {
      if (editable(event.target) || event.defaultPrevented || !readyIds.length) return
      event.preventDefault(); copy(event)
    }
    const pasted = (event: ClipboardEvent) => {
      if (editable(event.target) || event.defaultPrevented) return
      const files = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
      if (files.length) {
        event.preventDefault(); clipboard.current = []
        const rect = stage.current?.getBoundingClientRect()
        p.onDropFiles(files, rf.screenToFlowPosition({ x: (rect?.left ?? 0) + 80, y: (rect?.top ?? 0) + 80 }))
      } else if (clipboard.current.length) { event.preventDefault(); paste() }
    }
    window.addEventListener('keydown', key); window.addEventListener('copy', copied); window.addEventListener('paste', pasted)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('copy', copied); window.removeEventListener('paste', pasted) }
  })

  const doArrange = (mode: ArrangeMode) => {
    const target = p.selected.length > 1 ? p.items.filter((i) => sel.has(i.id)) : p.items
    const done = new Map(arrange(target, mode, { cols }).map((i) => [i.id, i]))
    setArranging(canvasMotionDuration() > 0)
    if (arrangeTimer.current) clearTimeout(arrangeTimer.current)
    arrangeTimer.current = setTimeout(() => setArranging(false), 380)
    const arranged = p.items.map((i) => done.get(i.id) ?? i)
    p.onItems(arranged, true)
    setMenu(null)
    toast(target.length ? '已整理画布' : '画布为空，上传图片后可整理')
    requestAnimationFrame(() => fitItems(arranged, false, 340))
  }
  const updateItem = (id: string, patch: Partial<CanvasItem>) => p.onItems(p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)), true)
  const reorder = (ids: string[], front: boolean) => {
    p.onItems(reorderCanvasItems(p.items, ids, front), true)
    toast(front ? '已移到顶层' : '已移到底层')
  }

  const wrapCls =
    (arranging ? 'arranging ' : '') +
    (p.tool === 'hand' ? 'canvas-hand ' : '') +
    (isMoving ? 'is-moving ' : '') +
    (p.items.length > 36 ? 'many-nodes' : '')

  return (
    <div
      ref={stage}
      className={'canvas-board ' + wrapCls.trim()}
      tabIndex={0}
      role="group"
      aria-label="画布图片区域"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-v2-asset')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={(e) => {
        setDragOver(false)
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const raw = e.dataTransfer.getData('application/x-v2-asset')
        if (raw) { e.preventDefault(); p.onDropAsset(raw, at); return }
        if (e.dataTransfer.files.length) { e.preventDefault(); p.onDropFiles(Array.from(e.dataTransfer.files), at) }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesConnectable={false}
        edgesFocusable={false}
        elevateEdgesOnSelect={false}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMoveStart={() => { setIsMoving(true); setMenu(null) }}
        onMoveEnd={() => setIsMoving(false)}
        onNodeDragStart={() => { p.onBeginMove(); setIsMoving(true); setMenu(null) }}
        onSelectionDragStart={() => { p.onBeginMove(); setIsMoving(true); setMenu(null) }}
        onSelectionDragStop={() => { p.onEndMove(); setIsMoving(false) }}
        onNodeDragStop={() => { p.onEndMove(); setIsMoving(false) }}
        onNodeDoubleClick={(_, n) => p.onPreview(n.id)}
        onNodeContextMenu={(e, n) => { e.preventDefault(); stage.current?.focus({ preventScroll: true }); if (!sel.has(n.id)) p.onSelect([n.id]); setMenu({ kind: 'node', id: n.id, x: e.clientX, y: e.clientY }) }}
        onPaneContextMenu={(e) => { e.preventDefault(); stage.current?.focus({ preventScroll: true }); setMenu({ kind: 'pane', x: e.clientX, y: e.clientY }) }}
        onPaneClick={() => setMenu(null)}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains('react-flow__pane')) fitItems(p.items) }}
        zoomOnDoubleClick={false}
        selectionOnDrag={p.tool === 'select'}
        panOnDrag={p.tool === 'hand' ? true : [1, 2]}
        panActivationKeyCode={null}
        nodesDraggable={p.tool === 'select' && !arranging}
        panOnScroll
        zoomActivationKeyCode={['Meta', 'Control']}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        deleteKeyCode={null}
        elevateNodesOnSelect={false}
        minZoom={0.02}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: panePad, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1f1f1f" />
        <CanvasNavigation items={p.items} selected={p.selected} cols={cols} onCols={setCols} onArrange={doArrange} active={p.active} drawerOpen={p.drawerOpen} />
        <ViewportPortal>
          {sections.map(section => <div key={section.id} className="canvas-section-title" style={{ transform: `translate(${section.x}px, ${section.y}px)`, width: section.width }}>
            <span>{section.label}</span><small>{section.count} 张</small>
          </div>)}
        </ViewportPortal>

        {one && usableImage(one) && (!menu || menu.kind === 'more' || menu.kind === 'options') && (
          <>
            <SelectionToolbar items={[one]} stage={stage}>
              <div role="group" aria-label="常用 AI 工具" className="selection-group">
                {actions.common.length ? actions.common.map(t => (
                  <button type="button" key={t.id} aria-pressed={t.fields?.length ? panel === t.id : undefined}
                    aria-haspopup={t.options ? 'menu' : undefined} aria-expanded={t.options ? menu?.kind === 'options' && menu.toolId === t.id : undefined}
                    onClick={event => { const r = event.currentTarget.getBoundingClientRect(); if (menu?.kind === 'options' && menu.toolId === t.id) setMenu(null); else openAction(t, one.id, { x: r.left, y: r.bottom + 6 }, event.currentTarget) }}>
                    <Icon name={t.icon} size={15} />{t.name}{t.options && <Icon name="chev" size={10} />}
                  </button>
                )) : <span className="selection-empty">暂无可用 AI 工具</span>}
              </div>
              <span className="dv" role="separator" aria-orientation="vertical" />
              <div role="group" aria-label="图片流转" className="selection-group">
                <button type="button" title="添加到对话" aria-label="添加到对话" onClick={() => p.onAddToChat([one.id])}><Icon name="chat" /></button>
                <button type="button" title="存为素材" aria-label="存为素材" onClick={() => p.onSaveMaterial([one.id])}><Icon name="star" /></button>
                <button type="button" title="下载" aria-label="下载" onClick={() => p.onDownload([one.id])}><Icon name="dl" /></button>
                <button type="button" title="查看来源" aria-label="查看来源" onClick={event => viewSources(one.id, event.currentTarget)}><Icon name="provenance" /></button>
              </div>
              <button type="button" aria-haspopup="menu" aria-expanded={menu?.kind === 'more'} onClick={event => { const r = event.currentTarget.getBoundingClientRect(); setMenu(menu?.kind === 'more' ? null : { kind: 'more', id: one.id, x: r.left, y: r.bottom + 6, trigger: event.currentTarget }) }}><Icon name="more" />更多</button>
            </SelectionToolbar>
            {panelDef && (
              <NodeToolbar nodeId={one.id} isVisible position={Position.Right} align="start" offset={12}>
                <ToolPanel def={{ ...panelDef, name: [...actions.common, ...actions.more].find(t => t.id === panelDef.id)?.name ?? panelDef.name }} item={one} params={params}
                  refChoices={p.items} hasMask={hasMask} onChange={setParams} onClearMask={() => { setHasMask(false); maskDataUrl.current = undefined; setMaskKey(k => k + 1) }}
                  onClose={() => setPanel(null)}
                  onSubmit={() => {
                    const { historyOption, ...submitted } = params
                    const id = historyTool?.options && typeof historyOption === 'string' ? `${panelDef.id}:${historyOption}` : panelDef.id
                    setPanel(null)
                    p.onRunTool(id, [one.id], { ...submitted, ...(maskDataUrl.current ? { maskDataUrl: maskDataUrl.current } : {}) })
                  }}
                />
              </NodeToolbar>
            )}
            <NodeToolbar nodeId={one.id} isVisible position={Position.Bottom} align="start" offset={8}>
              <span className="szc"><Icon name="lock" size={12} />W {one.image.width} · H {one.image.height}</span>
            </NodeToolbar>
          </>
        )}
        {multi && selectedItems.length > 1 && !menu && (
          <SelectionToolbar items={selectedItems} stage={stage}>
            <span className="lbl">已选 {p.selected.length} 张</span>
            <span className="dv" role="separator" aria-orientation="vertical" />
            <button type="button" disabled={!readyIds.length} onClick={() => p.onDownload(readyIds)}><Icon name="dl" />下载</button>
            <button type="button" disabled={!readyIds.length} onClick={() => p.onSaveMaterial(readyIds)}><Icon name="star" />存为素材</button>
            <button type="button" disabled={!readyIds.length} onClick={() => p.onAddToChat(readyIds)}><Icon name="chat" />添加到对话</button>
            <button type="button" className="danger" onClick={() => remove(p.selected)}><Icon name="trash" />删除</button>
          </SelectionToolbar>
        )}
      </ReactFlow>

      <div className="provenance-controls nodrag nopan">
        {trace && (
          <div className="provenance-inspector" role="region" aria-label="来源追踪">
            <div className="provenance-heading"><h2><Icon name="provenance" />查看来源</h2><button ref={sourceClose} type="button" aria-label="退出溯源" onClick={closeSources}><Icon name="x" /></button></div>
            <p role="status">{layers.length ? `第 ${traceStep + 1} / ${layers.length} 层来源 · ${traceLayer.size} 张` : parentIds(p.items.find(item => item.id === trace.id) ?? { id: trace.id }).length ? '来源图片已不在当前画布' : '这张图片没有记录来源'}</p>
            {layers.length > 0 && <div className="provenance-steps">
              <button type="button" disabled={traceStep === 0} onClick={() => setTrace({ ...trace, step: traceStep - 1 })}><Icon name="left" size={14} />上一层</button>
              <button type="button" disabled={traceStep >= layers.length - 1} onClick={() => setTrace({ ...trace, step: traceStep + 1 })}>下一层<Icon name="right" size={14} /></button>
            </div>}
          </div>
        )}
        <button ref={connectionsToggle} type="button" className="provenance-toggle" aria-pressed={showConnections} onClick={() => { setShowConnections(value => !value); setTrace(null) }}>
          <Icon name="provenance" size={16} /><span>显示连线</span><span className="provenance-switch" aria-hidden="true" />
        </button>
      </div>

      {dragOver && <div className="dropzone">松开放到画布</div>}

      {menu && menu.kind !== 'pane' && (() => {
        const item = p.items.find(i => i.id === menu.id)
        if (!item) return null
        const ids = sel.has(item.id) ? p.selected : [item.id]
        const availableIds = p.items.filter(i => ids.includes(i.id) && usableImage(i)).map(i => i.id)
        const batchMenu = ids.length > 1
        const close = () => setMenu(null)
        const act = (fn: () => void) => { close(); fn() }
        const tools = menu.kind === 'more' ? actions.more : actions.common
        const options = menu.kind === 'options' ? p.tools.find(t => t.id === menu.toolId) : undefined
        return (
          <FloatingMenu key={menu.kind} x={menu.x} y={menu.y} onClose={close} width={236} trigger={'trigger' in menu ? menu.trigger : undefined} label={menu.kind === 'options' ? '选择放大倍率' : menu.kind === 'more' ? '更多已接入工具' : '图片右键菜单'}>
            <div className="gt">{batchMenu ? `已选 ${ids.length} 张` : menu.kind === 'more' ? '已接入工具' : menu.kind === 'options' ? '放大倍率' : '图片操作'}</div>
            {!batchMenu && usableImage(item) && (
              <>
                {options ? options.options?.map(option => <button type="button" role="menuitem" className="mi" key={option.id} onClick={() => act(() => p.onRunTool(`${options.id}:${option.id}`, [item.id]))}><Icon name={options.icon} />{option.label}<small>{option.hint}</small></button>) : tools.map(t => (
                  <button type="button" role="menuitem" key={t.id} className="mi" onClick={event => { const r = event.currentTarget.getBoundingClientRect(); openAction(t, item.id, { x: r.left, y: r.top }) }}><Icon name={t.icon} />{t.name}{t.options && <small>选择倍率</small>}</button>
                ))}
                {!options && !tools.length && <div className="selection-empty">暂无已接入工具</div>}
                {menu.kind === 'node' && <button type="button" role="menuitem" className="mi" onClick={() => setMenu({ ...menu, kind: 'more' })}><Icon name="more" />更多工具<small>{actions.more.length}</small></button>}
                <div className="sep" role="separator" />
              </>
            )}
            <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onAddToChat(availableIds))}><Icon name="chat" />添加到对话</button>
            <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => copy())}><Icon name="copy" />复制<small>Ctrl C</small></button>
            <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onDownload(availableIds))}><Icon name="dl" />下载</button>
            <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onSaveMaterial(availableIds))}><Icon name="star" />存为素材</button>
            {menu.kind === 'node' && (
              <>
                <div className="sep" role="separator" />
                {!batchMenu && <button type="button" role="menuitem" className="mi" disabled={!usableImage(item)} onClick={() => act(() => p.onSetCover(item.id))}><Icon name="cover" />设为项目封面</button>}
                <button type="button" role="menuitem" className="mi" onClick={() => act(() => reorder(ids, true))}><Icon name="front" />移到顶层</button>
                <button type="button" role="menuitem" className="mi" onClick={() => act(() => reorder(ids, false))}><Icon name="back" />移到底层</button>
                {!batchMenu && <button type="button" role="menuitem" className="mi" onClick={() => act(() => updateItem(item.id, { locked: !item.locked }))}><Icon name="lock" />{item.locked ? '解除锁定' : '锁定位置'}</button>}
                {!batchMenu && <button type="button" role="menuitem" className="mi" onClick={event => viewSources(item.id, event.currentTarget)}><Icon name="provenance" />查看来源</button>}
                {!batchMenu && <button type="button" role="menuitem" className="mi" disabled={!usableImage(item)} onClick={() => act(() => p.onPreview(item.id))}><Icon name="info" />查看大图与参数</button>}
              </>
            )}
            <div className="sep" role="separator" />
            <button type="button" role="menuitem" className="mi danger" onClick={() => remove(ids)}><Icon name="trash" />删除<small>Delete</small></button>
          </FloatingMenu>
        )
      })()}
      {menu?.kind === 'pane' && (
        <FloatingMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} width={248} label="画布右键菜单">
          <button type="button" role="menuitem" className="mi" onClick={() => { paste(rf.screenToFlowPosition({ x: menu.x, y: menu.y })); setMenu(null) }}><Icon name="paste" />粘贴<small>Ctrl V</small></button>
          <ArrangeOptions items={p.items} selected={p.selected} cols={cols} onCols={setCols} onArrange={doArrange} />
          <div className="sep" />
          <button className="mi" onClick={() => { fitItems(p.items); setMenu(null) }}><Icon name="fit" />展示全部<small>Shift 1</small></button>
          <button className="mi" disabled={!p.selected.length} onClick={() => { fitItems(p.items.filter(item => sel.has(item.id)), true); setMenu(null) }}><Icon name="fit-selection" />定位到选中<small>Shift 2</small></button>
          <button className="mi" onClick={() => { p.onUpload(); setMenu(null) }}><Icon name="upload" />上传图片</button>
          <button className="mi" onClick={() => { p.onSelect(p.items.map((i) => i.id)); setMenu(null) }}><Icon name="check" />全选<small>Ctrl A</small></button>
        </FloatingMenu>
      )}
    </div>
  )
}
