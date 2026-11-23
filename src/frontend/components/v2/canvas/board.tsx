'use client'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ReactFlow, ViewportPortal, applyNodeChanges, useReactFlow,
  SelectionMode, useStoreApi, type NodeChange, type NodePositionChange, type XYPosition,
} from '@xyflow/react'
import { arrange, itemHeight, layoutSections } from '@/lib/v2/arrange'
import { boundsOfRects, snapCandidates, snapMove, trackSnapMotion, SNAP_MAX_SPEED, SNAP_SCREEN_THRESHOLD, type SnapGuide, type SnapMotion } from '@/lib/v2/canvas-snap'
import { applyCanvasAlignAction, applyResizePatch, nudgeCanvasItems, type CanvasAlignAction, type ResizePatch } from '@/lib/v2/canvas-transform'
import { canvasToolbarTools, pasteCanvasItems, reorderCanvasItems, selectionTools, unavailableCanvasTool, usableImage, type LayerOrder } from '@/lib/v2/selection-actions'
import type { CanvasEdit } from '@/lib/v2/canvas-raster'
import { generationToolParameters } from '@/lib/v2/generation-history'
import { ancestorLayers, parentIds } from '@/lib/v2/provenance'
import { canvasFitPad, canvasMotionDuration } from '@/lib/v2/fit'
import type { ArrangeMode, CanvasItem, ChatMessage, ToolDef, ToolParams } from '@/lib/v2/types'
import type { RegenerationPlan } from '@/lib/v2/regenerate'
import type { ToolRegenerationDraft } from '@/lib/v2/regenerate-draft'
import { Icon } from '../icons'
import { useV2Theme } from '../root'
import { FloatingMenu, useToast } from '../ui'
import { SnapGuides } from './snap-guides'
import { SelectionFrame } from './selection-frame'
import { SelectionToolbar } from './selection-toolbar'
import { CanvasDetailView, useSettledCanvasView } from './canvas-image-detail'
import { nodeTypes, type ImageNodeType, type NodeOverlay } from './image-node'
import { ToolPanel, defaultParams, filterCss, ratioOf } from './tool-panel'
import { ArrangeOptions, CanvasNavigation, useCanvasFit } from './canvas-navigation'
import { RegenerationActions } from './regeneration-actions'
import { ImageDimensionsControl, SelectionSideTools, VerticalSelectionTools } from './selection-controls'
import { BatchAction } from './batch-panel'

export interface BoardProps {
  items: CanvasItem[]
  selected: string[]
  tool: 'select' | 'hand'
  active: boolean
  focusId?: string | null
  drawerOpen?: boolean
  canvasBg?: string | null
  onCanvasBg?: (color: string | null) => void
  onBeginMove: () => void
  onEndMove: () => void
  tools: ToolDef[]
  messages?: ChatMessage[]
  messageStore?: ReturnType<typeof import('./workspace-stores').createChatStreamStore>['messages']
  toolSubmitting?: boolean
  onItems: (next: CanvasItem[], commit: boolean) => void
  onSelect: (ids: string[]) => void
  onRunTool: (toolId: string, ids: string[], params?: ToolParams, anchorId?: string) => void
  onEditTool: (toolId: string, sourceId: string, params: ToolParams, anchorId: string, notice?: string) => void
  onEditChat: (plan: Extract<RegenerationPlan, { kind: 'chat' }>) => void
  onRetryTool?: (runId: string, item?: CanvasItem) => void | Promise<void>
  onAddToChat: (ids: string[]) => void
  onDownload: (ids: string[], format?: 'original' | 'webp') => void
  onImageEdit: (ids: string[], edit: CanvasEdit) => void
  imageEditing?: boolean
  onVideo: (id: string) => void
  onSaveMaterial: (ids: string[]) => void
  onSetCover: (id: string) => void
  onPreview: (id: string) => void
  onCompare: (id: string) => void
  onDropAsset: (raw: string, at: { x: number; y: number }) => void
  onDropFiles: (files: File[], at: { x: number; y: number }) => void
  onUpload: () => void
  /** 工具广场入口；历史入口 previewOnly 只打开面板，确认后才提交 */
  autoTool?: ToolRegenerationDraft | null
}

function isDarkCanvas(bg: string | null | undefined, theme: 'light' | 'dark'): boolean {
  const m = bg?.trim().match(/^#([0-9a-f]{6})$/i)
  if (!m) return theme === 'dark'
  const hex = parseInt(m[1], 16)
  const luma = (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255
  return luma < 0.5
}

function canvasDotColor(bg: string | null | undefined, isDark: boolean): string {
  if (!bg?.trim().match(/^#([0-9a-f]{6})$/i)) return 'var(--cv-dot)'
  return isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.18)'
}

type Menu = null | { kind: 'node'; id: string; x: number; y: number } | { kind: 'pane'; x: number; y: number } | { kind: 'more' | 'options' | 'layers'; id: string; x: number; y: number; toolId?: string; trigger?: HTMLButtonElement }

const ALIGN_ACTIONS: { id: CanvasAlignAction; icon: string; label: string; minCount: number }[] = [
  { id: 'left', icon: 'align-left', label: '左对齐', minCount: 2 },
  { id: 'center-x', icon: 'align-center-x', label: '水平居中', minCount: 2 },
  { id: 'right', icon: 'align-right', label: '右对齐', minCount: 2 },
  { id: 'top', icon: 'align-top', label: '顶对齐', minCount: 2 },
  { id: 'center-y', icon: 'align-center-y', label: '垂直居中', minCount: 2 },
  { id: 'bottom', icon: 'align-bottom', label: '底对齐', minCount: 2 },
  { id: 'distribute-x', icon: 'distribute-x', label: '水平分布', minCount: 3 },
  { id: 'distribute-y', icon: 'distribute-y', label: '垂直分布', minCount: 3 },
]

export const Board = memo(function Board(p: BoardProps) {
  const rf = useReactFlow()
  const toast = useToast()
  const { theme } = useV2Theme()
  const darkCanvas = isDarkCanvas(p.canvasBg, theme)
  const stage = useRef<HTMLDivElement>(null)
  const clipboard = useRef<CanvasItem[]>([])
  const itemsRef = useRef(p.items)
  itemsRef.current = p.items
  const store = useStoreApi()
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const snapSession = useRef<{ raw: Map<string, XYPosition>; dx: number; dy: number; motion: SnapMotion } | null>(null)
  const snapOff = useRef(false)
  const clearSnap = useCallback(() => {
    snapSession.current = null
    setGuides(current => current.length ? [] : current)
  }, [])
  useEffect(() => {
    const sync = (event: KeyboardEvent) => { snapOff.current = event.ctrlKey || event.metaKey }
    const reset = () => { snapOff.current = false }
    window.addEventListener('keydown', sync)
    window.addEventListener('keyup', sync)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', reset)
    }
  }, [])
  useEffect(() => { if (!p.active) clearSnap() }, [p.active, clearSnap])
  const onEndMoveRef = useRef(p.onEndMove)
  onEndMoveRef.current = p.onEndMove
  const nudgeActive = useRef(false)
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushNudge = useCallback(() => {
    if (nudgeTimer.current) { clearTimeout(nudgeTimer.current); nudgeTimer.current = null }
    if (nudgeActive.current) { nudgeActive.current = false; onEndMoveRef.current() }
  }, [])
  useEffect(() => () => flushNudge(), [flushNudge])
  const fitItems = useCanvasFit(p.drawerOpen)
  const [menu, setMenu] = useState<Menu>(null)
  const [cols, setCols] = useState(5)
  const [dragOver, setDragOver] = useState(false)
  const [panel, setPanel] = useState<string | null>(null)
  const [historyTool, setHistoryTool] = useState<ToolDef | null>(null)
  const regenerationAnchor = useRef<string | undefined>(undefined)
  const [params, setParams] = useState<ToolParams>({})
  const [hasMask, setHasMask] = useState(false)
  const maskDataUrl = useRef<string | undefined>(undefined)
  const onMask = useCallback((has: boolean, dataUrl?: string) => { setHasMask(has); maskDataUrl.current = dataUrl }, [])
  const [maskKey, setMaskKey] = useState(0)
  const [arranging, setArranging] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const detailView = useSettledCanvasView(isMoving)
  const [trace, setTrace] = useState<{ id: string; step: number } | null>(null)
  const sourceTrigger = useRef<HTMLElement | null>(null)
  const sourceClose = useRef<HTMLButtonElement | null>(null)
  const traceId = trace?.id
  const layers = useMemo(() => traceId ? ancestorLayers(p.items, traceId) : [], [p.items, traceId])
  const traceStep = Math.min(trace?.step ?? 0, Math.max(0, layers.length - 1))
  const traceLayer = useMemo(() => new Set(layers[traceStep] ?? []), [layers, traceStep])
  const traceIds = useMemo(() => new Set(traceId ? [traceId, ...layers.flat()] : []), [traceId, layers])
  const selectedKey = p.selected.join('\0')
  const closeSources = useCallback(() => {
    setTrace(null)
    const trigger = sourceTrigger.current
    ;(trigger?.isConnected ? trigger : stage.current)?.focus({ preventScroll: true })
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
  const arrangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const multi = p.selected.length > 1
  const selectionKey = p.selected.join('\0')
  const sel = useMemo(() => new Set(p.selected), [selectionKey])
  const selectedItems = p.items.filter(i => sel.has(i.id))
  const readyIds = selectedItems.filter(usableImage).map(i => i.id)
  const actions = selectionTools(p.tools)
  const toolbarTools = canvasToolbarTools(p.tools, multi)

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
    regenerationAnchor.current = undefined
    setTrace(null)
    if (t.fields?.length || unavailableCanvasTool(t) || multi) {
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
      regenerationAnchor.current = a.anchorId
      setHistoryTool({ ...t, tip: a.notice ? `${a.notice}。请确认参数后生成。` : '历史参数已带入。请确认参考图片与参数，再点击生成。',
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
      className: p.focusId && p.focusId !== i.id ? 'nav-focus-muted' : trace ? (traceLayer.has(i.id) ? 'provenance-current' : traceIds.has(i.id) ? 'provenance-chain' : 'provenance-muted') : undefined,
      position: { x: i.x, y: i.y },
      data: { item: i, multi, onRetry: p.onRetryTool ? (runId: string) => p.onRetryTool?.(runId, i) : undefined, overlay: panel && sel.has(i.id) && (p.selected.length === 1 || panelDef?.id === 'adjust') ? overlay : undefined },
      zIndex: panel && p.selected[0] === i.id ? p.items.length + 1 : index,
      selected: sel.has(i.id),
      draggable: !i.locked && p.tool === 'select' && !arranging,
      style: { width: i.w, height: h },
      width: i.w,
      height: h,
      measured: { width: i.w, height: h },
    }
  }), [p.items, p.selected, p.focusId, multi, p.tool, p.onRetryTool, panel, overlay, trace, traceLayer, traceIds, arranging])

  const onNodesChange = useCallback((input: NodeChange<ImageNodeType>[]) => {
    const moves = input.filter((c): c is NodePositionChange & { position: XYPosition } => c.type === 'position' && !!c.position)
    const raw = new Map(moves.map(c => [c.id, c.position]))
    let dx = 0
    let dy = 0
    if (p.active && moves.some(c => c.dragging)) {
      const { transform: [tx, ty, zoom], width, height } = store.getState()
      const rects = p.items.map(item => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: itemHeight(item) }))
      const moving = rects.filter(rect => raw.has(rect.id)).map(rect => ({ ...rect, ...raw.get(rect.id) }))
      if (moving.length) {
        const bounds = boundsOfRects(moving)
        const motion = trackSnapMotion(snapSession.current?.motion ?? null, { x: bounds.x, y: bounds.y, t: performance.now() }, zoom)
        let indicators: SnapGuide[] = []
        if (!snapOff.current && motion.v < SNAP_MAX_SPEED) {
          const viewport = { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom }
          const candidates = snapCandidates(rects, new Set([...p.selected, ...raw.keys()]), viewport)
          const result = snapMove(bounds, candidates, SNAP_SCREEN_THRESHOLD / zoom)
          dx = result.dx
          dy = result.dy
          indicators = result.guides
        }
        snapSession.current = { raw, dx, dy, motion }
        setGuides(current => indicators.length || current.length ? indicators : current)
      }
    } else if (moves.length && snapSession.current) {
      // 松手时 React Flow 重发原始位置。只有同一批拖动坐标才回放最后的吸附位移。
      const last = snapSession.current
      if (moves.length === last.raw.size && moves.every(c => {
        const previous = last.raw.get(c.id)
        return c.dragging === false && previous?.x === c.position.x && previous.y === c.position.y
      })) {
        dx = last.dx
        dy = last.dy
      }
      clearSnap()
    }
    const changes = dx || dy ? input.map(c => c.type === 'position' && c.position
      ? { ...c, position: { x: c.position.x + dx, y: c.position.y + dy } } : c) : input
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
  }, [nodes, p, store, clearSnap])

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
    if (def.options?.length || ['describe', 'text-edit'].includes(def.id)) { setPanel(null); setMenu({ kind: 'options', id, ...at, toolId: def.id, trigger }) }
    else openTool(def, id)
  }
  useEffect(() => { flushNudge() }, [p.active, selectedKey, flushNudge])
  useEffect(() => {
    if (p.active === false) return
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]'))
    const uiControl = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('[role="menu"], [role="listbox"], [role="toolbar"]'))
    const key = (event: KeyboardEvent) => {
      if (editable(event.target) || event.defaultPrevented) return
      if (event.key === 'Escape') { setMenu(null); setPanel(null); p.onSelect([]); stage.current?.focus({ preventScroll: true }) }
      else if ((event.key === 'Delete' || event.key === 'Backspace') && p.selected.length) { event.preventDefault(); remove(p.selected) }
      else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !uiControl(event.target)
        && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && p.selected.length) {
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        event.preventDefault()
        const next = nudgeCanvasItems(itemsRef.current, p.selected, dx, dy)
        if (next !== itemsRef.current) {
          if (!nudgeActive.current) { nudgeActive.current = true; p.onBeginMove() }
          itemsRef.current = next
          p.onItems(next, false)
          if (nudgeTimer.current) clearTimeout(nudgeTimer.current)
          nudgeTimer.current = setTimeout(flushNudge, 300)
        }
      } else if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        const locked = !selectedItems.every(item => item.resolutionLocked)
        p.onItems(p.items.map(item => sel.has(item.id) ? { ...item, resolutionLocked: locked } : item), true)
      } else if ((event.ctrlKey || event.metaKey) && (['BracketLeft', 'BracketRight'].includes(event.code) || ['[', ']', '{', '}'].includes(event.key))) {
        event.preventDefault()
        const up = event.code === 'BracketRight' || [']', '}'].includes(event.key)
        reorder(p.selected, up ? event.shiftKey ? 'front' : 'up' : event.shiftKey ? 'back' : 'down')
      }
    }
    const keyup = (event: KeyboardEvent) => {
      if (nudgeActive.current && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) flushNudge()
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
    window.addEventListener('keydown', key); window.addEventListener('keyup', keyup); window.addEventListener('blur', flushNudge)
    window.addEventListener('copy', copied); window.addEventListener('paste', pasted)
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', flushNudge)
      window.removeEventListener('copy', copied); window.removeEventListener('paste', pasted)
    }
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
  const hasMovableSelection = selectedItems.some(i => !i.locked)
  const doAlign = (action: CanvasAlignAction) => {
    const next = applyCanvasAlignAction(p.items, p.selected, action)
    if (next !== p.items) p.onItems(next, true)
  }
  const reorder = (ids: string[], order: LayerOrder) => {
    p.onItems(reorderCanvasItems(p.items, ids, order), true)
    toast({ front: '已置顶', up: '已上移一层', down: '已下移一层', back: '已置底' }[order])
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
      <CanvasDetailView.Provider value={detailView}>
      <ReactFlow
        nodes={nodes}
        nodesConnectable={false}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMoveStart={() => { setIsMoving(true); setMenu(null) }}
        onMoveEnd={() => setIsMoving(false)}
        onNodeDragStart={event => { snapOff.current = event.ctrlKey || event.metaKey; p.onBeginMove(); setIsMoving(true); setMenu(null) }}
        onSelectionDragStart={() => { p.onBeginMove(); setIsMoving(true); setMenu(null) }}
        onSelectionDragStop={() => { clearSnap(); p.onEndMove(); setIsMoving(false) }}
        onNodeDragStop={() => { clearSnap(); p.onEndMove(); setIsMoving(false) }}
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
        disableKeyboardA11y
        elevateNodesOnSelect={false}
        minZoom={0.02}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: panePad, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={darkCanvas ? 3.5 : 2} color={canvasDotColor(p.canvasBg, darkCanvas)} />
        <CanvasNavigation items={p.items} selected={p.selected} cols={cols} onCols={setCols} onArrange={doArrange} active={p.active} drawerOpen={p.drawerOpen} canvasBg={p.canvasBg} onCanvasBg={p.onCanvasBg} onPreview={p.onPreview} onDownload={p.onDownload} />
        <ViewportPortal>
          {sections.map(section => <div key={section.id} className="canvas-section-title" style={{ transform: `translate(${section.x}px, ${section.y}px)`, width: section.width }}>
            <span>{section.label}</span><small>{section.count} 张</small>
          </div>)}
        </ViewportPortal>
        <SnapGuides guides={guides} />

        {selectedItems.length > 0 && readyIds.length > 0 && (!menu || ['more', 'options'].includes(menu.kind)) && <>
          <SelectionToolbar items={selectedItems} stage={stage}>
            {multi && <span className="lbl">已选 {p.selected.length} 张</span>}
            <div role="group" aria-label="常用 AI 工具" className="selection-group selection-quick-tools">
              {toolbarTools.map(t => multi && t.id === 'upscale' ? <BatchAction key={t.id} items={selectedItems} toolId={t.id} label={t.name} /> :
                <button type="button" key={t.id} title={t.name} aria-label={t.name} aria-pressed={panel === t.id}
                  aria-haspopup={t.options || ['describe', 'text-edit'].includes(t.id) ? 'menu' : undefined}
                  aria-expanded={t.options || ['describe', 'text-edit'].includes(t.id) ? menu?.kind === 'options' && menu.toolId === t.id : undefined}
                  onClick={event => { const r = event.currentTarget.getBoundingClientRect(); if (menu?.kind === 'options' && menu.toolId === t.id) setMenu(null); else openAction(t, selectedItems[0].id, { x: r.left, y: r.bottom + 6 }, event.currentTarget) }}>
                  {t.id === 'upscale' ? <span className="selection-hd" aria-hidden="true">HD</span> : <Icon name={t.icon} size={16} />}
                  <span className="selection-label" aria-hidden="true">{t.name}</span>
                  {(t.options || ['describe', 'text-edit'].includes(t.id)) && <Icon name="chev" size={10} />}
                </button>)}
              {!multi && <button type="button" title="更多工具" aria-label="更多工具" aria-haspopup="menu" aria-expanded={menu?.kind === 'more'}
                onClick={event => { const r = event.currentTarget.getBoundingClientRect(); setMenu(menu?.kind === 'more' ? null : { kind: 'more', id: selectedItems[0].id, x: r.left, y: r.bottom + 6, trigger: event.currentTarget }) }}><Icon name="more" size={19} /></button>}
            </div>
            {multi && <>
              <span className="dv" role="separator" aria-orientation="vertical" />
              <div role="group" aria-label="对齐与分布" className="selection-group selection-align-tools">
                {ALIGN_ACTIONS.map(action => (
                  <button
                    type="button"
                    key={action.id}
                    title={selectedItems.length < action.minCount ? `${action.label}（需至少选中 ${action.minCount} 张）` : action.label}
                    aria-label={action.label}
                    disabled={!hasMovableSelection || selectedItems.length < action.minCount}
                    onClick={() => doAlign(action.id)}
                  >
                    <Icon name={action.icon} size={15} />
                  </button>
                ))}
              </div>
            </>}
          </SelectionToolbar>
          <SelectionSideTools items={selectedItems} stage={stage}>
            <VerticalSelectionTools multi={multi}>
              {!multi && p.tools.find(t => t.id === 'crop') && <button type="button" title="裁剪" aria-label="裁剪" aria-pressed={panel === 'crop'} onClick={() => openTool(p.tools.find(t => t.id === 'crop')!, selectedItems[0].id)}><Icon name="crop" /></button>}
              {p.tools.find(t => t.id === 'adjust') && <button type="button" title="调色" aria-label="调色" aria-pressed={panel === 'adjust'} onClick={() => openTool(p.tools.find(t => t.id === 'adjust')!, selectedItems[0].id)}><Icon name="tune" /></button>}
              {multi && <button type="button" title="导出 PSD · 即将上线" aria-label="导出 PSD · 即将上线" disabled><Icon name="doc" /></button>}
              <button type="button" title="添加到聊天" aria-label="添加到聊天" onClick={() => p.onAddToChat(readyIds)}><Icon name="chat" /></button>
              {multi ? <button type="button" title="图层合并" aria-label="图层合并" disabled={p.imageEditing || readyIds.length !== selectedItems.length} onClick={() => p.onImageEdit(readyIds, { kind: 'merge' })}><Icon name="layers" /></button>
                : <button type="button" title="生成视频" aria-label="生成视频" onClick={() => p.onVideo(selectedItems[0].id)}><Icon name="video" /></button>}
            </VerticalSelectionTools>
          {panelDef && <>
            <ToolPanel def={{ ...panelDef, name: toolbarTools.find(t => t.id === panelDef.id)?.name ?? panelDef.name }} item={selectedItems[0]} params={params}
              unavailableReason={p.imageEditing ? '图片处理中…' : unavailableCanvasTool(panelDef) ?? (multi && !['crop', 'adjust'].includes(panelDef.id) ? '该工具暂不支持多选，请选择单张图片使用' : undefined)}
              refChoices={p.items} hasMask={hasMask} onChange={setParams} onClearMask={() => { setHasMask(false); maskDataUrl.current = undefined; setMaskKey(k => k + 1) }}
              onClose={() => setPanel(null)} onSubmit={() => {
                const { historyOption, ...submitted } = params
                const id = historyTool?.options && typeof historyOption === 'string' ? `${panelDef.id}:${historyOption}` : panelDef.id
                setPanel(null)
                if (panelDef.id === 'crop' || panelDef.id === 'adjust') p.onImageEdit(readyIds, { kind: panelDef.id, params: submitted })
                else p.onRunTool(id, [selectedItems[0].id], { ...submitted, ...(maskDataUrl.current ? { maskDataUrl: maskDataUrl.current } : {}) }, regenerationAnchor.current)
              }} />
          </>}
          </SelectionSideTools>
        </>}
      </ReactFlow>
      </CanvasDetailView.Provider>
      {one && <SelectionFrame
        item={one}
        stage={stage}
        resizable={!one.locked && one.status !== 'running' && p.tool === 'select' && overlay?.kind !== 'mask'}
        onBeginResize={() => { p.onBeginMove(); setIsMoving(true); setMenu(null) }}
        onResize={(patch: ResizePatch) => {
          const next = applyResizePatch(itemsRef.current, one.id, patch)
          if (next !== itemsRef.current) { itemsRef.current = next; p.onItems(next, false) }
        }}
        onEndResize={() => { p.onEndMove(); setIsMoving(false) }}
      >
        {one.mediaType === 'video' ? <span className="tnum" title="画布显示尺寸，不改变原视频分辨率">{Math.round(one.w)} × {itemHeight(one)}</span>
          : usableImage(one) && <ImageDimensionsControl item={one} busy={p.imageEditing} onPatch={patch => updateItem(one.id, patch)} onResize={(width, height) => p.onImageEdit([one.id], { kind: 'resize', width, height })} />}
      </SelectionFrame>}

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
        if (menu.kind === 'layers') return <FloatingMenu x={menu.x} y={menu.y} onClose={close} label="图层顺序" trigger={menu.trigger}>
          {([['front', '置顶', 'Ctrl Shift ]'], ['up', '上移', 'Ctrl ]'], ['down', '下移', 'Ctrl ['], ['back', '置底', 'Ctrl Shift [']] as const).map(([order, label, shortcut]) =>
            <button type="button" role="menuitem" className="mi" key={order} onClick={() => act(() => reorder(ids, order))}><Icon name={order === 'front' || order === 'up' ? 'front' : 'back'} />{label}<small>{shortcut}</small></button>)}
        </FloatingMenu>
        if (menu.kind === 'more') return <FloatingMenu x={menu.x} y={menu.y} onClose={close} width={220} trigger={menu.trigger} label="更多工具">
          {item.ref.type === 'generation' && <RegenerationActions key={item.id} item={item} items={p.items} messages={p.messages ?? []} messageStore={p.messageStore} tools={p.tools}
            submitting={p.toolSubmitting} onClose={close} onRun={p.onRunTool} onEditTool={p.onEditTool} onEditChat={p.onEditChat} />}
          {[...actions.common, ...actions.more].filter(t => !toolbarTools.some(shown => shown.id === t.id)).map(t => <button type="button" role="menuitem" key={t.id} className="mi" onClick={() => openTool(t, item.id)}><Icon name={t.icon} />{t.name}</button>)}
          <div className="sep" role="separator" />
          <button type="button" role="menuitem" className="mi" onClick={() => act(() => updateItem(item.id, { locked: !item.locked }))}><Icon name="lock" />{item.locked ? '解除位置锁定' : '锁定位置'}</button>
          <button type="button" role="menuitem" className="mi" onClick={event => viewSources(item.id, event.currentTarget)}><Icon name="provenance" />查看来源</button>
          <button type="button" role="menuitem" className="mi" onClick={() => act(() => p.onPreview(item.id))}><Icon name="info" />查看大图与参数</button>
        </FloatingMenu>
        if (menu.kind === 'options') {
          const def = p.tools.find(t => t.id === menu.toolId)
          if (!def) return null
          return <FloatingMenu x={menu.x} y={menu.y} onClose={close} trigger={menu.trigger} label={`${def.name}选项`}>
            {def.options ? def.options.map(option => <button type="button" role="menuitem" className="mi" key={option.id} onClick={() => act(() => p.onRunTool(`${def.id}:${option.id}`, [item.id]))}><Icon name={def.icon} />{option.label}<small>{option.hint}</small></button>)
              : <button type="button" role="menuitem" className="mi" onClick={() => multi || unavailableCanvasTool(def) ? openTool(def, item.id) : act(() => p.onRunTool(def.id, [item.id]))}><Icon name={def.icon} />{def.name}</button>}
          </FloatingMenu>
        }
        return <FloatingMenu x={menu.x} y={menu.y} onClose={close} width={248} label="图片右键菜单">
          <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => copy())}><Icon name="copy" />复制<small>Ctrl C</small></button>
          <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onDownload(availableIds, 'original'))}><Icon name="dl" />下载无损<small>原图</small></button>
          <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onDownload(availableIds, 'webp'))}><Icon name="dl" />下载<small>预览 WebP</small></button>
          <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onSaveMaterial(availableIds))}><Icon name="star" />添加到素材库</button>
          <button type="button" role="menuitem" className="mi" disabled={batchMenu || !usableImage(item)} onClick={() => act(() => p.onSetCover(item.id))}><Icon name="cover" />设为封面</button>
          <button type="button" role="menuitemcheckbox" aria-checked={ids.every(id => p.items.find(i => i.id === id)?.resolutionLocked)} className="mi" onClick={() => act(() => {
            const locked = !ids.every(id => p.items.find(i => i.id === id)?.resolutionLocked)
            p.onItems(p.items.map(i => ids.includes(i.id) ? { ...i, resolutionLocked: locked } : i), true)
          })}><Icon name="lock" />{ids.every(id => p.items.find(i => i.id === id)?.resolutionLocked) ? '解除分辨率锁定' : '锁定分辨率'}<small>Ctrl Alt L</small></button>
          <button type="button" role="menuitem" className="mi" aria-haspopup="menu" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ kind: 'layers', id: item.id, x: rect.right + 4, y: rect.top, trigger: event.currentTarget }) }}><Icon name="layer" />图层顺序<small>›</small></button>
          <button type="button" role="menuitem" className="mi" disabled={!availableIds.length} onClick={() => act(() => p.onAddToChat(availableIds))}><Icon name="chat" />添加到聊天</button>
          <div className="sep" role="separator" />
          <button type="button" role="menuitem" className="mi danger" onClick={() => remove(ids)}><Icon name="trash" />删除<small>Delete</small></button>
        </FloatingMenu>
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
})
