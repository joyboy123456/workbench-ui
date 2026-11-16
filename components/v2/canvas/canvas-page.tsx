'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { nextSlot } from '@/lib/v2/arrange'
import { usableImage } from '@/lib/v2/selection-actions'
import { createCanvasHistory, type CanvasUpdate } from '@/lib/v2/canvas-history'
import { canvasFitPad, canvasMotionDuration, isCanvasInput } from '@/lib/v2/fit'
import { mergeGenerationItem } from '@/lib/v2/generation-progress'
import { useLoad, useV2, type AgentEvent } from '@/lib/v2/data-source'
import type { AgentMode, CanvasItem, ChatAttachment, ChatMessage, ImageRef, Project, ToolParams } from '@/lib/v2/types'
import type { ComposerSubmission } from '../composer'
import { PENDING_KEY } from '../home-page'
import { Icon } from '../icons'
import { EmptyState, Preview, pickFiles, useToast } from '../ui'
import { AssetDrawer } from './asset-drawer'
import { Board } from './board'
import { ChatPanel, type SessionView } from './chat-panel'
import { GenerationStateProvider, GenerationVariantPicker } from './generation-state'

const SCALE = 150 / 1100
let seq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`

export { canvasFitPad } from '@/lib/v2/fit'

export function CanvasPage({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <Suspense fallback={<div className="cv-root" />}>
        <CanvasInner id={id} />
      </Suspense>
    </ReactFlowProvider>
  )
}

function CanvasInner({ id }: { id: string }) {
  const ds = useV2()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlView = searchParams?.get('view')
  const toast = useToast()
  const rf = useReactFlow()
  const { data: loaded, loading } = useLoad((d) => d.getProject(id), [id])
  const { data: tools } = useLoad((d) => d.listTools())
  const { data: toolPricing } = useLoad(d => d.getToolPricing ? d.getToolPricing() : Promise.resolve(undefined))
  const { data: account } = useLoad((d) => d.getAccount())

  const [view, setViewState] = useState<SessionView>(() => {
    if (urlView === 'chat') return 'chat'
    if (urlView === 'split') return 'split'
    if (typeof window !== 'undefined' && sessionStorage.getItem(PENDING_KEY(id))) return 'chat'
    return 'split'
  })
  const [chatCollapsed, setChatCollapsed] = useState(false)

  const setView = useCallback((next: SessionView) => {
    setViewState(next)
    if (next === 'chat') setChatCollapsed(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('view', next)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [])

  useEffect(() => {
    if (urlView === 'chat' || urlView === 'split') {
      setViewState(urlView)
      if (urlView === 'chat') setChatCollapsed(false)
    }
  }, [urlView])

  const [project, setProject] = useState<Project | null>(null)
  const [items, setItemsRaw] = useState<CanvasItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [tool, setTool] = useState<'select' | 'hand'>('select')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const effectiveTool = spaceHeld ? 'hand' : tool
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const [drawer, setDrawer] = useState(false)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const drawerRef = useRef(false)
  drawerRef.current = drawer && !drawerClosing
  const [busy, setBusy] = useState(false)
  const [toolSubmitting, setToolSubmitting] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [agentActive, setAgentActive] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const routeId = useRef(id)
  routeId.current = id
  const chatAbort = useRef<AbortController | null>(null)
  const [preview, setPreview] = useState<ImageRef | null>(null)
  const hist = useRef(createCanvasHistory())
  const batch = useRef<{ ids: string[] } | null>(null)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const itemsRef = useRef(items)

  const closeDrawer = useCallback(() => {
    setDrawerClosing(true)
    setTimeout(() => { setDrawer(false); setDrawerClosing(false) }, 180)
  }, [])

  const toggleDrawer = useCallback(() => {
    if (drawer && !drawerClosing) closeDrawer()
    else { setDrawerClosing(false); setDrawer(true) }
  }, [drawer, drawerClosing, closeDrawer])

  const initProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || initProjectRef.current === loaded.project.id) return
    initProjectRef.current = loaded.project.id
    setBusy(false); setAgentActive(false); setChatSending(false); setStopping(false); batch.current = null
    setProject(loaded.project); setItemsRaw(loaded.items); setMessages(loaded.messages)
    hist.current.reset(loaded.items)
    itemsRef.current = loaded.items
    setSelected([]); setHistoryCounts({ past: 0, future: 0 })
    if (!urlView && typeof window !== 'undefined' && !sessionStorage.getItem(PENDING_KEY(id))) {
      setViewState(loaded.items.length > 0 ? 'split' : 'chat')
    }
    requestAnimationFrame(() => rf.fitView({ padding: canvasFitPad(drawerRef.current), maxZoom: 1 }))
  }, [loaded, rf, urlView, id])

  const syncHistory = useCallback(() => {
    itemsRef.current = hist.current.items
    setItemsRaw(hist.current.items)
    setHistoryCounts(hist.current.counts)
  }, [])
  /** 拖动中不入栈，最后一帧提交整次手势。 */
  const setItems = useCallback((next: CanvasUpdate, commit = true) => {
    hist.current.update(next, commit)
    syncHistory()
  }, [syncHistory])
  const receiveItems = useCallback((update: (items: CanvasItem[]) => CanvasItem[]) => {
    hist.current.receive(update)
    syncHistory()
  }, [syncHistory])
  const endMove = useCallback(() => {
    hist.current.endMove()
    syncHistory()
  }, [syncHistory])
  const undo = useCallback(() => {
    hist.current.undo()
    syncHistory()
  }, [syncHistory])
  const redo = useCallback(() => {
    hist.current.redo()
    syncHistory()
  }, [syncHistory])

  // 自动保存（防抖）
  useEffect(() => {
    if (!project || project.id !== id || toolSubmitting) return
    const t = setTimeout(() => {
      void ds.saveCanvas(project.id, items, messages)
        .catch((error: unknown) => toast(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请稍后重试'))
    }, 800)
    saveTimer.current = t
    return () => clearTimeout(t)
  }, [items, messages, project, id, ds, toast, toolSubmitting])

  // 快捷键仅在画布可见且焦点不在可编辑控件时生效。
  useEffect(() => {
    const release = () => setSpaceHeld(false)
    const visibility = () => { if (document.hidden) release() }
    const onKey = (e: KeyboardEvent) => {
      if (view !== 'split' || preview || e.defaultPrevented || e.isComposing || isCanvasInput(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space' && !mod && !e.altKey) {
        if (e.target instanceof Element && e.target.closest('button, a[href], summary, [role="button"]')) return
        e.preventDefault(); setSpaceHeld(true); return
      }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(itemsRef.current.map((i) => i.id)) }
      else if (!mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') setTool('select')
      else if (!mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') setTool('hand')
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); rf.zoomIn({ duration: canvasMotionDuration(150) }) }
      else if (mod && e.key === '-') { e.preventDefault(); rf.zoomOut({ duration: canvasMotionDuration(150) }) }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') release() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [undo, redo, rf, view, preview])
  useEffect(() => { if (view !== 'split') setSpaceHeld(false) }, [view])

  /* ---------- Agent 事件 ---------- */
  const onEvent = useCallback((e: AgentEvent) => {
    if (e.type === 'message') setMessages((messages) => messages.some(message => message.id === e.message.id) ? messages.map(message => message.id === e.message.id ? e.message : message) : [...messages, e.message])
    else if (e.type === 'message-update') setMessages((m) => m.map((x) => (x.id === e.id && x.role === 'assistant' ? { ...x, ...e.patch } : x)))
    else if (e.type === 'item-add') {
      // Replay/upsert preserves saved layout while refreshing authoritative media/status.
      if (itemsRef.current.some(item => item.id === e.item.id)) {
        const replay = (item: CanvasItem) => item.id === e.item.id ? mergeGenerationItem(item, { ...e.item, x: item.x, y: item.y, w: item.w, locked: item.locked }) : item
        receiveItems(items => items.map(replay))
        return
      }
      // Data sources reserve positions before sending a placeholder. Rendering
      // and completion must never arrange the same output a second time.
      batch.current = { ids: [...(batch.current?.ids ?? []), e.item.id] }
      receiveItems(p => p.some(item => item.id === e.item.id) ? p : [...p, e.item])
      clearTimeout(focusTimer.current)
      focusTimer.current = setTimeout(() => {
        const ids = batch.current?.ids ?? []
        if (ids.length) rf.fitView({ nodes: ids.map((id) => ({ id })), padding: canvasFitPad(drawerRef.current), duration: 400, maxZoom: 1 })
      }, 120)
    }
    else if (e.type === 'item-update') {
      receiveItems(items => items.map(item => item.id === e.id ? mergeGenerationItem(item, e.patch) : item))
    }
    else if (e.type === 'error') toast(e.message)
  }, [receiveItems, toast, rf])

  useEffect(() => {
    if (!project || project.id !== id || !ds.watchToolRuns) return
    return ds.watchToolRuns(project.id, onEvent)
  }, [project?.id, id, ds, onEvent])

  useEffect(() => {
    if (!project || project.id !== id || !ds.watchAgent) return
    const controller = new AbortController()
    chatAbort.current = controller
    setAgentActive(false)
    void ds.watchAgent(id, event => {
      if (!controller.signal.aborted && routeId.current === id) onEvent(event)
    }, state => {
      if (!controller.signal.aborted && routeId.current === id) setAgentActive(state.active)
    }, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) toast(error instanceof Error ? error.message : '对话恢复失败')
    })
    return () => { controller.abort(); chatAbort.current = null }
  }, [id, project?.id, ds, onEvent])

  const stop = async () => {
    if (!project || !ds.stopMessage || stopping) return
    setStopping(true)
    try {
      const result = await ds.stopMessage(project.id)
      toast(result.inFlightSlotCount ? `已停止后续生成，${result.inFlightSlotCount} 张已提交的图片仍会继续返回` : '已停止后续生成')
    } catch (error) { toast(error instanceof Error ? error.message : '停止失败，请稍后重试') }
    finally { setStopping(false) }
  }

  const send = async (text: string, mode: AgentMode, atts = attachments, submission?: ComposerSubmission) => {
    if (!project || busy || agentActive) return
    setBusy(true); setChatSending(true); batch.current = null
    const signal = chatAbort.current?.signal
    try {
      // Show actual referenced inputs on canvas; never invent an asset identity.
      const existing = itemsRef.current
      const at = nextSlot(existing)
      const added = atts.filter(attachment => !existing.some(item => item.image.id === attachment.image.id))
        .map((attachment, index) => toItem(attachment, { x: at.x + index * 164, y: at.y }))
      if (added.length) setItems([...existing, ...added])
      // Freeze all current source positions and obstacles before either adapter
      // reserves output slots, including when all references already existed.
      clearTimeout(saveTimer.current)
      await ds.saveCanvas(project.id, itemsRef.current, messages)
      if (submission?.tool) {
        const selectedTool = tools?.find(tool => tool.id === submission.tool?.id)
        if (!selectedTool) throw new Error('工具目录已更新，请重新选择工具')
        const source = itemsRef.current.find(item => item.image.id === atts[0]?.image.id)
        if (!source) throw new Error('请先引用一张源图')
        if (selectedTool.overlay || selectedTool.editor) {
          setAttachments([])
          setView('split'); setSelected([source.id])
          setAutoTool({ toolId: selectedTool.id, itemId: source.id, params: submission.tool.params })
          toast('参数已带入画布，请完成编辑后提交')
          return
        }
        const user: ChatMessage = { id: uid('u'), role: 'user', text: `/${selectedTool.name} ${text}`.trim(), attachments: atts, createdAt: new Date().toISOString() }
        onEvent({ type: 'message', message: user })
        // Both sources resolve itemIds through the saved canvas, as the toolbar does.
        await ds.saveCanvas(project.id, itemsRef.current, [...messages, user])
        setAttachments([])
        const sourceIds = selectedTool.surfaces.includes('batch')
          ? atts.flatMap(attachment => { const item = itemsRef.current.find(item => item.image.id === attachment.image.id); return item ? [item.id] : [] })
          : [source.id]
        await ds.runTool(project.id, selectedTool.id, sourceIds, onEvent, submission.tool.params)
        return
      }
      setAttachments([])
      await ds.sendMessage(project.id, { text, attachments: atts, mode, generation: submission?.generation }, event => {
        if (routeId.current === project.id && !signal?.aborted) onEvent(event)
      }, signal)
    } catch (error) { toast(error instanceof Error ? error.message : '发送失败，请稍后重试') }
    finally { if (routeId.current === project.id) { setBusy(false); setChatSending(false) } }
  }

  // 从首页带过来的首条消息
  const pendingDone = useRef(false)
  const [autoTool, setAutoTool] = useState<{ toolId: string; itemId: string; params?: ToolParams; previewOnly?: boolean } | null>(null)
  useEffect(() => {
    if (searchParams?.has('reuse') || searchParams?.has('generation')) return
    if (!project || !tools || pendingDone.current) return
    pendingDone.current = true
    const raw = sessionStorage.getItem(PENDING_KEY(project.id))
    if (!raw) return
    sessionStorage.removeItem(PENDING_KEY(project.id))
    const p = JSON.parse(raw) as { text: string; mode: AgentMode; attachments: ChatAttachment[]; toolId?: string; submission?: ComposerSubmission }
    // 从 AI 工具广场进来：图先落画布并自动选中；画布上有对应工具就直接打开它的参数面板，否则交给对话
    if (p.toolId) {
      const def = tools.find((t) => t.backendToolId === Number(p.toolId) && t.surfaces.includes('selection'))
      const name = p.text.replace(/^\//, '').trim()
      if (!p.attachments.length) {
        setView('split')
        toast(def ? `上传或拖入一张图，选中后点「${def.name}」` : `上传图片后，在对话里说「${name}」`)
        return
      }
      const base = nextSlot(items)
      const placed = p.attachments.map((a, i) => toItem(a, { x: base.x + i * 164, y: base.y }))
      setItems((prev) => [...prev, ...placed])
      if (def) {
        setView('split')
        setSelected([placed[0].id])
        setTimeout(() => setAutoTool({ toolId: def.id, itemId: placed[0].id }), 80)
      } else {
        setView('chat')
        send(p.text, p.mode, placed.map((it, i) => ({ kind: 'canvas' as const, id: it.id, label: `图 ${i + 1}`, image: it.image })))
      }
      return
    }
    setView('chat')
    void send(p.text, p.mode, p.attachments, p.submission).catch(error => toast(error instanceof Error ? error.message : '首条消息未发送'))
  }, [project, tools])

  /* ---------- 画布动作 ---------- */
  const canvasImages = useMemo(() => items.filter(usableImage).map((i, n) => ({ id: i.id, label: `图 ${n + 1}`, image: i.image })), [items])
  const selectedGenIds = useMemo(
    () => items.filter((i) => selected.includes(i.id) && i.ref.type === 'generation').map((i) => i.ref.id),
    [items, selected]
  )
  const addToChat = (ids: string[]) => {
    const add = canvasImages.filter((c) => ids.includes(c.id)).map<ChatAttachment>((c) => ({ kind: 'canvas', id: c.id, label: c.label, image: c.image }))
    setAttachments((a) => [...a, ...add.filter((x) => !a.some((y) => y.id === x.id))])
    if (add.length) { setChatCollapsed(false); toast(`已添加 ${add.length} 张到对话`) }
    else toast('请先选择已完成的图片')
  }
  const addAtts = (atts: ChatAttachment[]) => setAttachments((a) => [...a, ...atts.filter((x) => !a.some((y) => y.id === x.id))])
  const toItem = (a: ChatAttachment, at: { x: number; y: number }): CanvasItem => ({
    id: uid('ci'),
    ref: a.kind === 'product' ? { type: 'product', id: a.id, imageId: a.image.id } : { type: 'material', id: a.id },
    image: a.image, x: at.x, y: at.y, w: Math.round(1100 * SCALE),
    createdAt: new Date().toISOString(), ...(a.kind === 'model' ? { assetKind: 'model' } : {}),
  })
  const place = (atts: ChatAttachment[], at?: { x: number; y: number }) => {
    const base = at ?? nextSlot(items)
    setItems((p) => [...p, ...atts.map((a, i) => toItem(a, { x: base.x + i * 164, y: base.y }))])
  }
  const placeFiles = (files: File[], at?: { x: number; y: number }) => {
    const images = files.filter(file => file.type.startsWith('image/'))
    if (!images.length) { if (files.length) toast('请选择图片文件'); return }
    const base = at ?? nextSlot(items)
    if (ds.uploadChatAttachment) {
      const upload = ds.uploadChatAttachment
      void Promise.all(images.map(upload)).then(atts => {
        if (routeId.current !== id) return
        setItems(previous => [...previous, ...atts.map((attachment, index) => toItem(attachment, { x: base.x + index * 164, y: base.y }))])
        toast(`已上传 ${atts.length} 张图片`)
      }).catch((error: unknown) => toast(error instanceof Error ? error.message : '上传失败'))
      return
    }
    images.forEach((f, i) => {
      const url = URL.createObjectURL(f)
      const im = new Image()
      im.onload = () => {
        if (routeId.current !== id) { URL.revokeObjectURL(url); return }
        toast('已上传图片'); setItems((p) => [...p, { id: uid('ci'), ref: { type: 'material', id: url }, image: { id: url, url, width: im.naturalWidth, height: im.naturalHeight }, createdAt: new Date().toISOString(), x: base.x + i * 164, y: base.y, w: Math.round(Math.min(im.naturalWidth, 1100) * SCALE) }])
      }
      im.onerror = () => { URL.revokeObjectURL(url); toast('图片读取失败，请重试') }
      im.src = url
    })
  }
  const runTool = async (toolId: string, ids: string[], params?: ToolParams) => {
    if (!project) return
    const [base, opt] = toolId.split(':')
    const def = tools?.find((t) => t.id === base)
    const name = (def?.name ?? base) + (opt ? ` ${def?.options?.find((o) => o.id === opt)?.label ?? opt}` : '')
    if (def?.editor) { toast(def.fields?.length ? `${name}：已另存为新图（mock，未真正处理）` : `${name}：画布编辑器还没接，先占位`); return }
    if (ds.watchToolRuns && !def?.backendToolId && base !== 'outpaint') { toast(`${name}：该工具还在准备中`); return }
    toast(base === 'describe' ? `${name}：结果会出现在对话里` : `${name}：已开始${ds.watchToolRuns ? '' : '（mock）'}`)
    batch.current = null
    try {
      // Both adapters need the latest source and obstacles before reserving slots.
      clearTimeout(saveTimer.current); setToolSubmitting(true)
      await ds.saveCanvas(project.id, itemsRef.current, messages)
      await ds.runTool(project.id, toolId, ids, onEvent, params)
    } catch (error) { toast(error instanceof Error ? error.message : '提交工具任务失败') }
    finally { setToolSubmitting(false) }
  }
  const download = (ids: string[]) => {
    const ready = items.filter(i => ids.includes(i.id) && usableImage(i))
    for (const item of ready) {
      const a = document.createElement('a')
      a.href = item.image.url; a.download = `图片-${item.image.id}.png`; a.target = '_blank'; a.rel = 'noopener'
      a.click()
    }
    toast(ready.length ? `已发起下载 ${ready.length} 张图片` : '请先选择已完成的图片')
  }
  const saveMaterial = async (ids: string[]) => {
    if (!project) return
    const ready = items.filter(i => ids.includes(i.id) && usableImage(i))
    if (!ready.length) { toast('请先选择已完成的图片'); return }
    try {
      await ds.saveCanvas(project.id, itemsRef.current, messages)
      const results = await Promise.allSettled(ready.map(item => ds.saveCanvasMaterial(project.id, item.id)))
      const count = results.filter(result => result.status === 'fulfilled').length
      const failure = results.find(result => result.status === 'rejected')
      toast(failure?.status === 'rejected' ? `已保存 ${count}/${ready.length} 张；${failure.reason instanceof Error ? failure.reason.message : '其余保存失败，请重试'}` : `已存为素材 ${count} 张`)
    } catch (error) { toast(error instanceof Error ? error.message : '存为素材失败，请重试') }
  }
  const setCover = async (cid: string) => {
    if (!project) return
    try {
      await ds.saveCanvas(project.id, itemsRef.current, messages)
      const updated = await ds.setProjectCover(project.id, cid)
      if (routeId.current === project.id) setProject(updated)
      toast('已设为项目封面')
    } catch (error) { toast(error instanceof Error ? error.message : '设置封面失败，请重试') }
  }

  /** 点消息内图片：切到分栏并在画布上选中、居中这张图 */
  const focusResult = useCallback((genId: string) => {
    setView('split')
    setChatCollapsed(false)
    const it = itemsRef.current.find(
      (i) => (i.ref.type === 'generation' && i.ref.id === genId) || i.id === genId || i.image.id === genId
    )
    if (!it) {
      requestAnimationFrame(() => rf.fitView({ padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1 }))
      return
    }
    setSelected([it.id])
    requestAnimationFrame(() => {
      rf.fitView({ nodes: [{ id: it.id }], padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1.75 })
    })
  }, [rf, setView])

  const historyRequest = searchParams?.get('reuse') ?? searchParams?.get('generation')
  const reuseHistory = Boolean(searchParams?.get('reuse'))
  const handledHistory = useRef<string | null>(null)
  useEffect(() => {
    if (!historyRequest || !project || project.id !== id || !tools || !loaded) return
    const key = `${id}:${reuseHistory}:${historyRequest}`
    if (handledHistory.current === key) return
    let cancelled = false
    void ds.getGeneration(historyRequest).then(detail => {
      if (cancelled) return
      handledHistory.current = key
      if (!detail || detail.generation.projectId !== id) { toast('记录不存在或不属于当前项目'); return }
      const g = detail.generation
      const match = (ref: string | undefined) => ref ? itemsRef.current.find(item => item.id === ref || item.ref.id === ref || item.image.id === ref) : undefined
      const result = match(g.id)
      if (!reuseHistory) {
        if (result) focusResult(result.id)
        else toast('这张作品已从画布移除，生成记录仍然保留')
        return
      }
      const source = match(g.parentId) ?? result
      if (!source) { toast('来源图片已从画布移除，请先从素材库添加参考图'); return }
      const original = tools.find(tool => tool.id === g.toolId?.split(':')[0])
      const def = original ?? tools.find(tool => tool.id === (g.kind === 'detail' ? 'detail-page' : 'swap-bg'))
      if (!def) { toast('原工具当前不可用，请选择其他工具继续创作'); return }
      focusResult(source.id)
      setAutoTool({ toolId: original ? g.toolId! : def.id, itemId: source.id, params: { ...g.params, ...(g.prompt ? { prompt: g.prompt } : {}) }, previewOnly: true })
      toast(original ? '已带回历史参数，请核对；参考图和蒙版需重新确认' : `历史未记录工具，已在「${def.name}」中带入提示词，请确认`)
    }).catch(error => { if (!cancelled) { handledHistory.current = key; toast(error instanceof Error ? error.message : '历史参数读取失败') } })
    return () => { cancelled = true }
  }, [historyRequest, reuseHistory, project, id, tools, loaded, ds, focusResult, toast])

  /** 点右上角「展开画布」：切到分栏并选中、居中当前或最新生成的图 */
  const expandCanvas = useCallback(() => {
    setView('split')
    setChatCollapsed(false)
    const currentSel = itemsRef.current.find((i) => selected.includes(i.id))
    const fallback =
      currentSel ??
      itemsRef.current.find((i) => i.status !== 'running' && i.image.url) ??
      itemsRef.current[0]
    if (fallback) {
      setSelected([fallback.id])
      requestAnimationFrame(() => {
        rf.fitView({ nodes: [{ id: fallback.id }], padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1.75 })
      })
    } else {
      requestAnimationFrame(() => {
        rf.fitView({ padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1 })
      })
    }
  }, [rf, selected, setView])

  const handleCollapseChange = useCallback((nextCollapsed: boolean) => {
    setChatCollapsed(nextCollapsed)
    setTimeout(() => {
      const selNodes = selected.map((sid) => ({ id: sid }))
      if (selNodes.length === 1) {
        rf.fitView({ nodes: selNodes, padding: canvasFitPad(drawerRef.current), duration: 280, maxZoom: 1.75 })
      } else {
        rf.fitView({ padding: canvasFitPad(drawerRef.current), duration: 280, maxZoom: 1 })
      }
    }, 320)
  }, [rf, selected])

  if (loading) {
    return (
      <div className={'cv-root mode-' + view}>
        <aside className={'fp view-' + view} aria-hidden>
          <div className="fh"><Link href="/v2" className="lg">品</Link><div className="skel-line" style={{ width: 120, marginTop: 0 }} /></div>
          <div className="ms">
            <div className="ms-col">
              <div className="shimmer" style={{ height: 68, borderRadius: 12, alignSelf: 'flex-end', width: '65%' }} />
              <div className="shimmer" style={{ height: 140, borderRadius: 12, width: '85%' }} />
            </div>
          </div>
          <div className="cp-col">
            <div className="cp2"><div className="shimmer" style={{ height: 56, borderRadius: 10 }} /></div>
          </div>
        </aside>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="cv-root" style={{ display: 'grid', placeItems: 'center' }}>
        <EmptyState
          icon="canvas"
          title="项目不存在"
          subtitle="该项目可能已被删除或链接有误"
          action={<button className="btn pri" onClick={() => router.push('/v2')}>回到首页</button>}
        />
      </div>
    )
  }

  const isSplit = view === 'split'

  return (
    <GenerationStateProvider items={items}>
    <div
      className={
        'cv-root mode-' +
        view +
        (isSplit && chatCollapsed ? ' chat-collapsed' : '') +
        (effectiveTool === 'hand' ? ' hand' : '')
      }
    >
      <ChatPanel
        project={project}
        messages={messages}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSend={(t, m, submission) => send(t, m, attachments, submission)}
        canvasImages={canvasImages}
        busy={busy || agentActive}
        onStop={ds.stopMessage && (chatSending || agentActive) ? stop : undefined}
        stopping={stopping}
        drawerOpen={drawer && !drawerClosing}
        onToggleDrawer={toggleDrawer}
        onRename={async (name) => { await ds.renameProject(project.id, name); setProject({ ...project, name }) }}
        onNewProject={async () => { const p = await ds.createProject({}); router.push(`/v2/canvas/${p.id}?view=chat`) }}
        onFocusResult={focusResult}
        view={view}
        collapsed={chatCollapsed}
        onCollapseChange={handleCollapseChange}
        onViewChange={setView}
        onExpandCanvas={expandCanvas}
        selectedGenIds={selectedGenIds}
        credits={account?.credits}
        avatar={account?.avatar}
      />

      <div className="cv-stage" aria-hidden={!isSplit || undefined}>
        {isSplit && <GenerationVariantPicker />}
        <Board
          key={project.id}
          items={items}
          selected={selected}
          tool={effectiveTool}
          active={isSplit && !preview}
          drawerOpen={drawer && !drawerClosing}
          onBeginMove={() => hist.current.beginMove()}
          onEndMove={endMove}
          tools={(tools ?? []).map(def => ds.getToolPricing ? { ...def, cost: toolPricing?.perOutput } : def)}
          onItems={(n, commit) => setItems(n, commit)}
          onSelect={setSelected}
          onRunTool={runTool}
          onRetryTool={ds.retryToolRun ? (runId) => ds.retryToolRun?.(project.id, runId, onEvent) : undefined}
          onAddToChat={addToChat}
          onDownload={download}
          onSaveMaterial={saveMaterial}
          onSetCover={setCover}
          onPreview={(pid) => { const it = items.find((i) => i.id === pid); if (it?.image.url) setPreview(it.image) }}
          onDropAsset={(raw, at) => place([JSON.parse(raw) as ChatAttachment], at)}
          onDropFiles={placeFiles}
          onUpload={async () => placeFiles(await pickFiles())}
          autoTool={autoTool}
        />

        {isSplit && chatCollapsed && (
          <div className="cv-collapsed-bar">
            <Link href="/v2" className="lg" title="回到首页" aria-label="回到首页">品</Link>
            <span className="pj-title" title={project.name}>{project.name}</span>
            <span className="dv" />
            <button
              className="expand-chat-btn"
              onClick={() => handleCollapseChange(false)}
              title="展开对话栏"
              aria-label="展开对话栏"
              data-testid="expand-chat-btn"
            >
              <Icon name="sidebar-open" size={15} />
              <span>展开对话栏</span>
            </button>
            <button
              className="ibtn"
              onClick={() => setView('chat')}
              title="放大成全屏对话"
              aria-label="放大成全屏对话"
            >
              <Icon name="expand" size={14} />
            </button>
          </div>
        )}

        <div className="tr">
          <button
            className={drawer && !drawerClosing ? 'on' : ''}
            onClick={toggleDrawer}
            title="资产库"
          >
            <Icon name="asset" size={14} />资产
          </button>
          <button onClick={() => download(selected.length ? selected : items.map((i) => i.id))}>
            <Icon name="dl" size={14} />导出
          </button>
          <span><Icon name="zap" size={12} /> {account?.credits ?? '–'}</span>
          <span className="av" style={account?.avatar ? { backgroundImage: `url(${account.avatar})` } : undefined} />
        </div>

        {drawer && <AssetDrawer projectId={project.id} closing={drawerClosing} onClose={closeDrawer} onAddToChat={addAtts} onPlace={(a) => place(a)} />}

        <div className="bt" role="toolbar" aria-label="画布工具">
          <button className={effectiveTool === 'select' ? 'on' : ''} aria-label="选择" aria-pressed={effectiveTool === 'select'} title="选择 V" onClick={() => setTool('select')}><Icon name="cur" /></button>
          <button className={effectiveTool === 'hand' ? 'on' : ''} aria-label="抓手" aria-pressed={effectiveTool === 'hand'} title="抓手 H / 按住空格" onClick={() => setTool('hand')}><Icon name="hand" /></button>
          <button aria-label="上传图片" title="上传图片" onClick={async () => placeFiles(await pickFiles())}><Icon name="plus" /></button>
          <span className="dv" />
          <button disabled={!historyCounts.past} aria-label="撤销" title="撤销 Ctrl Z" onClick={undo}><Icon name="undo" /></button>
          <button disabled={!historyCounts.future} aria-label="重做" title="重做 Ctrl Shift Z" onClick={redo}><Icon name="redo" /></button>
          <span className="dv" />
          <button aria-label="快捷键" title="快捷键" onClick={() => toast('V 选择 · H 抓手 · 空格拖动 · Shift+1 展示全部 · Shift+2 定位选中 · Ctrl 滚轮缩放 · Ctrl C/V 复制粘贴 · Delete 删除 · Esc 取消选择')}><Icon name="kbd" /></button>
        </div>

      </div>

      {preview && <Preview image={preview} onClose={() => setPreview(null)} />}
    </div>
    </GenerationStateProvider>
  )
}
