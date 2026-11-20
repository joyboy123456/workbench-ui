'use client'
import { useV2Auth } from '../auth'
import { AccountMenu } from '../account-menu'
import { generationMetadata } from '@/lib/v2/image-metadata'
import Link from 'next/link'
import { advancePending, canSendMessage, pendingMessage, PENDING_KEY, readPendingDraft, type PendingMessage } from '@/lib/v2/pending-message'
import { chatFailure } from '@/lib/v2/agent-chat-contract'
import { mergeChatMessage, patchChatMessage } from '@/lib/v2/chat-messages'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { nextSlot } from '@/lib/v2/arrange'
import { usableImage } from '@/lib/v2/selection-actions'
import { editCanvasImages, placeEditedImages, refreshCanvasAttachments, type CanvasEdit } from '@/lib/v2/canvas-raster'
import { canvasDownload } from '@/lib/v2/canvas-download'
import { createCanvasHistory, type CanvasUpdate } from '@/lib/v2/canvas-history'
import { applyCanvasAgentEvent, createCurtainSync, type CurtainSync } from '@/lib/v2/curtain-sync'
import { canvasFitPad, canvasMotionDuration, isCanvasInput } from '@/lib/v2/fit'
import { mergeGenerationItem } from '@/lib/v2/generation-progress'
import { comparePair } from '@/lib/v2/compare'
import { regeneratePlan, regenerationRecord, regenerationNotice, type RegenerationPlan } from '@/lib/v2/regenerate'
import { regenerationEvents, regenerationToolInput } from '@/lib/v2/regenerate-run'
import type { CanvasRegenerationDraft } from '@/lib/v2/regenerate-draft'
import { useLoad, useV2, type AgentEvent } from '@/lib/v2/data-source'
import type { AgentMode, AskMessage, CanvasItem, ChatAttachment, ChatMessage, Project, ToolParams } from '@/lib/v2/types'
import { COMPOSER_REFERENCE_LIMIT, composerAttachments, mergeAttachments, syncSelectedCanvasAttachments } from '@/lib/v2/composer-input'
import { CLOTHING_TOOLS } from '@/lib/clothing-tool-catalog'
import { normalizeAgentMode } from '@/lib/v2/agent-mode'
import type { ComposerSubmission } from '../composer'
import { BrandMark, Icon } from '../icons'
import { Lightbox, type LightboxItem } from '../lightbox'
import { TaskTray } from '../task-tray'
import { EmptyState, pickFiles, useToast } from '../ui'
import { AssetDrawer } from './asset-drawer'
import { Board } from './board'
import { BatchProvider } from './batch-panel'
import { ChatPanel, type SessionView } from './chat-panel'
import { GenerationStateProvider } from './generation-state'
import { ExportDialog } from './export-dialog'
import { CanvasTools } from './canvas-tools'
import { CollapsedProjectMenu, ProjectHistory } from '../project-history'
import { extractActiveReferences, findCanvasItemForReference, ReferencePanel } from './reference-panel'

const SCALE = 150 / 1100
const MANUAL_TITLE_KEY = (projectId: string) => `v2:manual-title:${projectId}`
const curtainRemovalsKey = (userId: string, projectId: string) => `v2:curtain-removals:${userId}:${projectId}`
let seq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`

function readCurtainRemovals(key: string): string[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

function writeCurtainRemovals(key: string, ids: string[]) {
  try {
    if (ids.length) sessionStorage.setItem(key, JSON.stringify(ids))
    else sessionStorage.removeItem(key)
  } catch { /* The live sync queue still saves when session storage is unavailable. */ }
}

export { canvasFitPad } from '@/lib/v2/fit'

export function CanvasPage({ id }: { id: string }) {
  const { user, loading } = useV2Auth()
  if (loading) return <div className="cv-root"><p role="status">正在恢复账号…</p></div>
  if (!user) return <div className="cv-root"><p>登录后打开项目。</p><AccountMenu /></div>
  return (
    <ReactFlowProvider>
      <Suspense fallback={<div className="cv-root" />}>
        <CanvasInner key={`${user.id}:${id}`} id={id} userId={user.id} />
      </Suspense>
    </ReactFlowProvider>
  )
}

function CanvasInner({ id, userId }: { id: string; userId: string }) {
  const ds = useV2()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlView = searchParams?.get('view')
  const toast = useToast()
  const newProjectLock = useRef(false)
  const [creatingProject, setCreatingProject] = useState(false)
  useEffect(() => { newProjectLock.current = false; setCreatingProject(false) }, [id])
  const newProject = async () => {
    if (newProjectLock.current) return
    newProjectLock.current = true; setCreatingProject(true)
    try {
      const created = await ds.createProject({})
      router.push(`/v2/canvas/${created.id}?view=chat`)
    } catch { newProjectLock.current = false; setCreatingProject(false); toast('新建项目失败，请重试') }
  }
  const rf = useReactFlow()
  const fitView = rf.fitView
  const { data: loaded, loading, error: loadError, reload } = useLoad(async d => {
    const document = await d.getProject(id)
    if (!document || !d.patchCurtain) return document
    const key = curtainRemovalsKey(userId, id)
    const removeIds = readCurtainRemovals(key)
    if (!removeIds.length) return document
    // Replay a deletion interrupted by refresh before showing the project or starting its stream.
    await d.patchCurtain(id, { removeIds })
    const saved = new Set(removeIds)
    writeCurtainRemovals(key, readCurtainRemovals(key).filter(itemId => !saved.has(itemId)))
    return d.getProject(id)
  }, [id, userId])
  const { data: tools, error: toolsError } = useLoad((d) => d.listTools())
  const { data: toolPricing } = useLoad(d => d.getToolPricing ? d.getToolPricing() : Promise.resolve(undefined))
  const { data: account } = useLoad((d) => d.getAccount())

  const [view, setViewState] = useState<SessionView>(() => {
    if (urlView === 'chat') return 'chat'
    if (urlView === 'split') return 'split'
    return 'split'
  })
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [refCollapsed, setRefCollapsed] = useState<boolean>()
  const [refTab, setRefTab] = useState<'refs' | 'materials'>('refs')
  const [canvasBg, setCanvasBg] = useState<string | null>(null)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
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
  const autoSelectedIds = useRef<Set<string>>(new Set())
  const dismissedSelection = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() })
  const handleAttachmentsChange = useCallback((next: ChatAttachment[]) => {
    const present = new Set(next.map(item => item.image.id))
    for (const imgId of [...autoSelectedIds.current]) {
      if (!present.has(imgId)) {
        autoSelectedIds.current.delete(imgId)
        dismissedSelection.current.ids.add(imgId)
      }
    }
    setAttachments(next)
  }, [])
  const [tool, setTool] = useState<'select' | 'hand'>('select')
  const [focusId, setFocusId] = useState<string | null>(null)
  const focusViewport = useRef<ReturnType<typeof rf.getViewport> | null>(null)
  const exitFocus = useCallback(() => {
    setFocusId(null)
    if (focusViewport.current) void rf.setViewport(focusViewport.current, { duration: canvasMotionDuration(200) })
    focusViewport.current = null
  }, [rf])
  useEffect(() => {
    if (!focusId) return
    if (!items.some(item => item.id === focusId)) { exitFocus(); return }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isCanvasInput(event.target)) return
      event.preventDefault(); event.stopImmediatePropagation(); exitFocus()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [focusId, items, exitFocus])
  const [spaceHeld, setSpaceHeld] = useState(false)
  const effectiveTool = spaceHeld ? 'hand' : tool
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const [drawer, setDrawer] = useState(false)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const drawerRef = useRef(false)
  drawerRef.current = drawer && !drawerClosing
  const [busy, setBusy] = useState(false)
  const [toolSubmitting, setToolSubmitting] = useState(false)
  const [imageEditing, setImageEditing] = useState(false)
  const imageEditLock = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [agentActive, setAgentActive] = useState(false)
  const [channel, setChannel] = useState<(import('@/lib/v2/agent-chat-contract').AgentChatState & { projectId: string }) | null>(null)
  const sendLock = useRef(false)
  const [chatSending, setChatSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const routeId = useRef(id)
  routeId.current = id
  const chatAbort = useRef<AbortController | null>(null)
  const [previewState, setPreviewState] = useState<{ items: LightboxItem[]; index: number; comparisonSelection?: readonly string[] } | null>(null)
  const [favMap, setFavMap] = useState<Record<string, boolean>>({})
  const preview = Boolean(previewState)
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
  const manualTitleRef = useRef(false)
  const autoTitledRef = useRef(false)
  const curtainSyncRef = useRef<{ projectId: string; sync: CurtainSync } | null>(null)
  const closeCurtainSync = useCallback(() => {
    const current = curtainSyncRef.current
    curtainSyncRef.current = null
    if (current) void current.sync.dispose().catch(() => undefined)
  }, [])
  const ensureCurtainSync = useCallback((projectId: string) => {
    if (curtainSyncRef.current?.projectId === projectId) return curtainSyncRef.current.sync
    closeCurtainSync()
    const patchCurtain = ds.patchCurtain
    const sync = createCurtainSync({
      send: (patch, snapshot) => patchCurtain ? patchCurtain(projectId, patch) : ds.saveCanvas(projectId, snapshot),
      onPendingRemovalsChange: patchCurtain ? ids => writeCurtainRemovals(curtainRemovalsKey(userId, projectId), ids) : undefined,
      onError: error => toast(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请稍后重试'),
    })
    curtainSyncRef.current = { projectId, sync }
    return sync
  }, [closeCurtainSync, ds, toast, userId])
  useEffect(() => closeCurtainSync, [closeCurtainSync])
  const flushCurtain = useCallback(async () => {
    if (!project) return
    await ensureCurtainSync(project.id).flush()
  }, [project, ensureCurtainSync])
  const persistMessages = useCallback(async (projectId: string, nextMessages: ChatMessage[]) => {
    if (ds.saveMessages) await ds.saveMessages(projectId, nextMessages)
    else await ds.saveCanvas(projectId, itemsRef.current, nextMessages)
  }, [ds])

  useEffect(() => {
    if (!loaded || loaded.project.id !== id || initProjectRef.current === id) return
    initProjectRef.current = loaded.project.id
    const savedManual = typeof window !== 'undefined' && (() => {
      try { return localStorage.getItem(MANUAL_TITLE_KEY(loaded.project.id)) === '1' } catch { return false }
    })()
    manualTitleRef.current = savedManual
    autoTitledRef.current = loaded.project.name !== '未命名项目'
    setBusy(false); setAgentActive(false); setChatSending(false); setStopping(false); batch.current = null
    setFocusedMessageId(null); setRefCollapsed(false); setPreviewState(null); setFavMap({})
    setProject(loaded.project); setItemsRaw(loaded.items); setMessages(loaded.messages)
    hist.current.reset(loaded.items)
    itemsRef.current = loaded.items
    ensureCurtainSync(loaded.project.id).reset(loaded.items)
    autoSelectedIds.current = new Set()
    dismissedSelection.current = { key: '', ids: new Set() }
    setSelected([]); setHistoryCounts({ past: 0, future: 0 }); setAutoTool(null); setAttachments([])
    if (!urlView && typeof window !== 'undefined' && !readPendingDraft(id)) {
      setViewState(loaded.items.length > 0 ? 'split' : 'chat')
    }
    requestAnimationFrame(() => rf.fitView({ padding: canvasFitPad(drawerRef.current), maxZoom: 1 }))
  }, [loaded, rf, urlView, id, ensureCurtainSync])

  const syncHistory = useCallback((syncCurtain = true) => {
    itemsRef.current = hist.current.items
    setItemsRaw(hist.current.items)
    setHistoryCounts(hist.current.counts)
    if (syncCurtain && initProjectRef.current === routeId.current) {
      ensureCurtainSync(routeId.current).sync(hist.current.items)
    }
  }, [ensureCurtainSync])
  /** 拖动中不入栈，最后一帧提交整次手势。 */
  const setItems = useCallback((next: CanvasUpdate, commit = true) => {
    hist.current.update(next, commit)
    syncHistory(commit)
  }, [syncHistory])
  const receiveItems = useCallback((update: (items: CanvasItem[]) => CanvasItem[]) => {
    hist.current.receive(update)
    syncHistory(true)
  }, [syncHistory])
  const endMove = useCallback(() => {
    hist.current.endMove()
    syncHistory(true)
  }, [syncHistory])
  const undo = useCallback(() => {
    hist.current.undo()
    syncHistory(true)
  }, [syncHistory])
  const redo = useCallback(() => {
    hist.current.redo()
    syncHistory(true)
  }, [syncHistory])

  // 对话缓存独立防抖保存，与幕布增量同步解耦且跳过流式中间态
  useEffect(() => {
    if (!project || project.id !== id || messages.some(m => m.role === 'assistant' && m.streaming)) return
    const t = setTimeout(() => {
      void persistMessages(project.id, messages)
        .catch((error: unknown) => toast(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请稍后重试'))
    }, 800)
    saveTimer.current = t
    return () => clearTimeout(t)
  }, [messages, project, id, persistMessages, toast])

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
      else if (mod && e.key === '0') { e.preventDefault(); rf.zoomTo(1, { duration: canvasMotionDuration(150) }) }
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
  const applyAgentTitle = useCallback((title?: string) => {
    if (!title || manualTitleRef.current || autoTitledRef.current) return
    autoTitledRef.current = true
    setProject((prev) => {
      if (!prev || prev.name !== '未命名项目') return prev
      return { ...prev, name: title }
    })
  }, [])

  const onEvent = useCallback((e: AgentEvent) => {
    if (e.type === 'message') {
      if (e.message.role === 'assistant' || e.message.role === 'ask') applyAgentTitle(e.message.title)
      setMessages(messages => mergeChatMessage(messages, e.message))
    }
    else if (e.type === 'message-update') {
      applyAgentTitle(e.patch.title)
      setMessages(messages => patchChatMessage(messages, e.id, e.patch))
    }
    else if (e.type === 'item-add') {
      const sync = curtainSyncRef.current?.projectId === routeId.current ? curtainSyncRef.current.sync : undefined
      const resolved = applyCanvasAgentEvent(itemsRef.current, e, { isRemoved: itemId => Boolean(sync?.isRemoved(itemId)) })
      if (sync?.isRemoved(e.item.id)) return
      if (!resolved.addedNew) {
        const replay = (item: CanvasItem) => item.id === e.item.id
          ? mergeGenerationItem(item, { ...e.item, x: item.x, y: item.y, w: item.w, ...(item.locked !== undefined ? { locked: item.locked } : {}) })
          : item
        receiveItems(items => items.map(replay))
        return
      }
      const placed = resolved.items.at(-1)!
      batch.current = { ids: [...(batch.current?.ids ?? []), placed.id] }
      receiveItems(p => p.some(item => item.id === placed.id) ? p : [...p, placed])
      clearTimeout(focusTimer.current)
      focusTimer.current = setTimeout(() => {
        const ids = batch.current?.ids ?? []
        if (ids.length) fitView({ nodes: ids.map((id) => ({ id })), padding: canvasFitPad(drawerRef.current), duration: 400, maxZoom: 1 })
      }, 120)
    }
    else if (e.type === 'item-update') {
      const sync = curtainSyncRef.current?.projectId === routeId.current ? curtainSyncRef.current.sync : undefined
      if (sync?.isRemoved(e.id)) return
      receiveItems(items => items.map(item => item.id === e.id ? mergeGenerationItem(item, e.patch) : item))
    }
    else if (e.type === 'error') toast(e.message)
  }, [receiveItems, toast, fitView, applyAgentTitle])

  useEffect(() => {
    if (!project || project.id !== id || !ds.watchToolRuns) return
    return ds.watchToolRuns(project.id, onEvent)
  }, [project?.id, id, ds, onEvent])

  useEffect(() => {
    if (!project || project.id !== id || !ds.watchAgent) return
    const controller = new AbortController()
    chatAbort.current = controller
    setAgentActive(false)
    setChannel({ active: false, projectId: id, ready: false })
    void ds.watchAgent(id, event => {
      if (!controller.signal.aborted && routeId.current === id) onEvent(event)
    }, state => {
      if (!controller.signal.aborted && routeId.current === id) {
        setAgentActive(state.active)
        setChannel({ ...state, projectId: id })
      }
    }, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setChannel({ active: false, projectId: id, ready: false, error: error instanceof Error ? error.message : '对话恢复失败' })
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

  const turnRunning = Boolean(channel?.projectId === id && channel.lifecycle?.turn === 'running')
  const readiness = {
    project: Boolean(project && project.id === id),
    channel: !ds.watchAgent || Boolean(channel?.projectId === id && channel.ready && chatAbort.current && !chatAbort.current.signal.aborted),
    busy: busy || sendLock.current,
    active: turnRunning,
    error: channel?.projectId === id ? channel.error : undefined,
  }
  const send = async (text: string, mode: AgentMode, atts = attachments, submission?: ComposerSubmission, home?: { messageId: string; caseId?: string; beforePost(): void; onRejected(): void }) => {
    const messageId = home?.messageId ?? crypto.randomUUID()
    const canSend = mode === 'video'
      ? readiness.project && readiness.channel && !readiness.busy && !readiness.error
      : canSendMessage(readiness)
    if (!project || !canSend || sendLock.current) return false
    if (!home && pending.current?.projectId === id && pending.current.state.status === 'failed') {
      // An explicit new message takes over a draft whose attachment preparation failed.
      sessionStorage.removeItem(PENDING_KEY(id))
    }
    sendLock.current = true
    let released = false
    const releaseComposer = () => {
      if (released) return
      released = true
      sendLock.current = false
      if (routeId.current === project.id) { setBusy(false); setChatSending(false) }
    }
    const user: ChatMessage = { id: messageId, role: 'user', text, mode, generation: submission?.generation, attachments: atts, createdAt: new Date().toISOString() }
    onEvent({ type: 'message', message: user })
    setFocusedMessageId(null)
    setBusy(true); setChatSending(true); batch.current = null
    const signal = chatAbort.current?.signal
    try {
      // Show actual referenced inputs on canvas; never invent an asset identity.
      const existing = itemsRef.current
      const at = nextSlot(existing)
      const added = atts.filter(attachment => !existing.some(item => item.image.id === attachment.image.id))
        .map((attachment, index) => toItem(attachment, { x: at.x + index * 164, y: at.y }))
      if (added.length) setItems([...existing, ...added])
      if (submission?.tool) {
        await flushCurtain()
        const selectedTool = tools?.find(tool => tool.id === submission.tool?.id)
        if (!selectedTool) throw new Error('工具目录已更新，请重新选择工具')
        const source = itemsRef.current.find(item => item.image.id === atts[0]?.image.id)
        if (!source) throw new Error('请先引用一张源图')
        if (selectedTool.overlay || selectedTool.editor) {
          autoSelectedIds.current = new Set(); setAttachments([])
          setView('split'); setSelected([source.id])
          setAutoTool({ toolId: selectedTool.id, itemId: source.id, params: submission.tool.params })
          toast('参数已带入画布，请完成编辑后提交')
          return
        }
        user.text = `/${selectedTool.name} ${text}`.trim()
        onEvent({ type: 'message', message: user })
        clearTimeout(saveTimer.current)
        await persistMessages(project.id, mergeChatMessage(messages, user))
        const sourceIds = selectedTool.surfaces.includes('batch') || selectedTool.id === 'try-on'
          ? atts.flatMap(attachment => { const item = itemsRef.current.find(item => item.image.id === attachment.image.id); return item ? [item.id] : [] })
          : [source.id]
        let failed = false
        await ds.runTool(project.id, selectedTool.id, sourceIds, event => {
          if (event.type === 'item-add') releaseComposer()
          if (event.type === 'error') failed = true
          onEvent(event)
        }, submission.tool.params)
        if (failed) return false
        autoSelectedIds.current = new Set(); setAttachments([])
        return
      }
      const effectiveCaseId = home?.caseId ?? submission?.caseId
      const sent = await ds.sendMessage(project.id, { clientMessageId: messageId, text, attachments: atts, mode, ...(effectiveCaseId ? { caseId: effectiveCaseId } : {}), generation: submission?.generation }, event => {
        if (event.type === 'item-add') releaseComposer()
        if (event.type === 'message' && event.message.id === `agent-error-${messageId}` && event.message.role === 'assistant'
          && event.message.failure?.receiptState === 'not_accepted') home?.onRejected()
        if (routeId.current === project.id && !signal?.aborted) onEvent(event)
      }, signal, home?.beforePost)
      if (sent === false) return false
      autoSelectedIds.current = new Set(); setAttachments([])
    } catch (error) {
      onEvent({ type: 'message', message: chatFailure(`agent-error-${messageId}`, error instanceof Error ? error.message : '发送失败，请稍后重试') })
      return false
    }
    finally { releaseComposer() }
  }

  // Keep the home draft until a ready channel claims it; refs make repeated effects harmless.
  type HomeDraft = {
    text: string
    mode: AgentMode
    attachments: ChatAttachment[]
    toolId?: string
    caseId?: string
    prefillOnly?: boolean
    inputHint?: string[]
    messageId?: string
    claimed?: boolean
    submission?: ComposerSubmission
  }
  const pending = useRef<{ projectId: string; messageId: string; state: PendingMessage<HomeDraft> } | null>(null)
  const [unconfirmedHome, setUnconfirmedHome] = useState(false)
  const [pendingTick, setPendingTick] = useState(0)
  const [autoTool, setAutoTool] = useState<CanvasRegenerationDraft | null>(null)
  const galleryEntry = useRef<string | null>(null)
  useEffect(() => {
    const toolId = searchParams?.get('tool')
    if (!toolId || !tools || !project || project.id !== id || galleryEntry.current === `${id}:${toolId}`) return
    galleryEntry.current = `${id}:${toolId}`
    const def = tools.find(tool => tool.id === toolId || tool.backendToolId === Number(toolId))
    const catalogTool = CLOTHING_TOOLS.find(item => String(item.id) === toolId)
    if (!def && !catalogTool) { toast('此工具暂不可用，请从工具菜单重新选择'); return }
    // 画布几何/蒙版原子操作保留覆盖层入口；其余垂类能力统一收口进 Agent 对话流，不再弹多字段表单。
    if (def?.overlay || def?.editor) {
      setAutoTool({ kind: 'chat', prefill: { id: `gallery:${id}:${toolId}`, text: '', mode: 'agent', toolId: def.id } })
    } else {
      const toolName = catalogTool?.name ?? def?.name ?? 'AI 创作'
      const hint = catalogTool?.inputs.length ? catalogTool.inputs.join('、') : '商品图'
      setAutoTool({ kind: 'chat', prefill: { id: `gallery:${id}:${toolId}`, text: `请帮我做「${toolName}」`, mode: 'agent' } })
      toast(`已进入 Agent 对话，上传${hint}后回车即可生成`)
    }
    setChatCollapsed(false)
    setView('split')
  }, [id, project, tools, searchParams, toast, setView])
  useEffect(() => {
    if (searchParams?.has('reuse') || searchParams?.has('generation')) return
    if (pending.current?.projectId !== id) {
      const raw = readPendingDraft(id)
      if (!raw) return
      let homeDraft: HomeDraft
      try {
        homeDraft = JSON.parse(raw) as HomeDraft
        if (typeof homeDraft?.text !== 'string' || !Array.isArray(homeDraft.attachments)) throw new Error()
      } catch {
        sessionStorage.removeItem(PENDING_KEY(id))
        toast('浏览器中的草稿无法读取，请查看项目中已保存的消息。')
        return
      }
      pending.current = { projectId: id, messageId: homeDraft.messageId ?? crypto.randomUUID(), state: pendingMessage({ ...homeDraft, mode: normalizeAgentMode(homeDraft.mode) }, Date.now()) }
    }
    const entry = pending.current
    const p = entry.state.draft
    if (p.claimed) {
      // A reload during a POST only checks the original receipt.
      entry.state.status = 'sending'
      if (!readiness.project || !channel?.ready) return
      const rejection = loaded?.messages.find(message => message.id === `agent-error-${entry.messageId}`)
      if (channel.receipts?.some(receipt => receipt.clientMessageId === entry.messageId)
        || rejection?.role === 'assistant' && rejection.failure?.receiptState === 'not_accepted') {
        sessionStorage.removeItem(PENDING_KEY(id))
        entry.state.status = 'sent'
        delete p.claimed
        setUnconfirmedHome(false)
      } else {
        setMessages(previous => previous.some(message => message.id === entry.messageId) ? previous : [...previous, {
          id: entry.messageId, role: 'user', text: p.text, mode: p.mode, attachments: p.attachments, createdAt: new Date().toISOString(),
        }])
        setUnconfirmedHome(true)
      }
      return
    }
    const needsTools = Boolean(p.toolId || p.submission?.tool)
    const rejected = [401, 403, 404, 429].includes(channel?.failure?.status ?? 0)
    const next = advancePending(entry.state, { ...readiness, project: readiness.project && (!needsTools || Boolean(tools)),
      channel: readiness.channel && !readiness.error,
      error: (rejected || !channel?.failure ? readiness.error : undefined) ?? (needsTools ? toolsError : undefined) }, Date.now())
    entry.state = next.state
    const preserveFailure = () => {
      if (routeId.current !== id) return
      onEvent({ type: 'message', message: { id: entry.messageId, role: 'user', text: p.text, attachments: p.attachments, createdAt: new Date().toISOString() } })
      onEvent({ type: 'message', message: chatFailure(`agent-error-${entry.messageId}`, entry.state.error ?? '未发送，已保留草稿') })
      setAttachments(p.attachments)
      setAutoTool({ kind: 'chat', prefill: { id: entry.messageId, text: p.text, mode: p.mode, ...(p.caseId ? { caseId: p.caseId } : {}), generation: p.submission?.generation, firstFrame: p.submission?.firstFrame } })
      // Terminal drafts remain in the input, but must not auto-send again on remount.
      sessionStorage.removeItem(PENDING_KEY(id))
    }
    if (next.action === 'fail') { preserveFailure(); return }
    if (next.action === 'wait') {
      if (entry.state.status !== 'queued') return
      const timer = setTimeout(() => setPendingTick(value => value + 1), Math.max(0, entry.state.deadline - Date.now()))
      return () => clearTimeout(timer)
    }
    if (p.prefillOnly) {
      sessionStorage.removeItem(PENDING_KEY(id))
      entry.state = advancePending(entry.state, readiness, Date.now(), 'sent').state
      setAutoTool({ kind: 'chat', prefill: { id: entry.messageId, text: p.text, mode: p.mode, ...(p.caseId ? { caseId: p.caseId } : {}) } })
      const hints = p.inputHint?.length ? p.inputHint.join('、') : '商品图'
      toast(`请先上传你的${hints}，按回车即可复刻同款效果`)
      return
    }
    // Tool gallery navigation is an input command, not a generation request.
    const def = p.toolId ? tools?.find(t => t.backendToolId === Number(p.toolId) && t.surfaces.includes('selection')) : undefined
    if (p.toolId && (!p.attachments.length || def)) {
      sessionStorage.removeItem(PENDING_KEY(id))
      entry.state = advancePending(entry.state, readiness, Date.now(), 'sent').state
      setView('split')
      if (!p.attachments.length) { toast(def ? `上传或拖入一张图，选中后点「${def.name}」` : '上传图片后，在对话里选择工具'); return }
      const base = nextSlot(itemsRef.current)
      const placed = p.attachments.map((a, i) => toItem(a, { x: base.x + i * 164, y: base.y }))
      setItems(prev => [...prev, ...placed])
      setSelected([placed[0].id])
      if (def) setAutoTool({ toolId: def.id, itemId: placed[0].id })
      return
    }
    let postStarted = false
    const beforePost = () => {
      sessionStorage.setItem(PENDING_KEY(id), JSON.stringify({ ...p, claimed: true, messageId: entry.messageId }))
      postStarted = true
    }
    // Tool commands and mock sessions have no chat receipt to recover.
    if (!ds.watchAgent || p.submission?.tool) sessionStorage.removeItem(PENDING_KEY(id))
    const sendingSignal = chatAbort.current?.signal
    void send(p.text, p.mode, p.attachments, p.submission, { messageId: entry.messageId, caseId: p.caseId, beforePost, onRejected: () => { postStarted = false } }).then(sent => {
      entry.state = advancePending(entry.state, readiness, Date.now(), sent === false ? 'failed' : 'sent').state
      if (routeId.current !== id || sendingSignal?.aborted) return
      if (sent === false) {
        // Once a POST starts, recover its receipt instead of presenting a sendable duplicate.
        if (postStarted) {
          setUnconfirmedHome(true)
          return
        }
        setAttachments(p.attachments)
        setAutoTool({ kind: 'chat', prefill: { id: entry.messageId, text: p.text, mode: p.mode,
          caseId: p.caseId, generation: p.submission?.generation, firstFrame: p.submission?.firstFrame } })
        // During navigation the browser can reject a fetch before React unmounts.
        // Preserve the queued/claimed boundary recorded at the actual POST.
        return
      }
      sessionStorage.removeItem(PENDING_KEY(id))
    })
  }, [id, project, tools, toolsError, channel, busy, turnRunning, pendingTick, setView])

  /* ---------- 画布动作 ---------- */
  const canvasImages = useMemo(() => items.filter(usableImage).map((i, n) => ({ id: i.id, label: `图 ${n + 1}`, image: i.image })), [items])

  useEffect(() => {
    const selectionKey = selected.join(',')
    if (dismissedSelection.current.key !== selectionKey) {
      dismissedSelection.current = { key: selectionKey, ids: new Set() }
    }
    const effectiveSelected = selected.filter(itemId => {
      const found = canvasImages.find(c => c.id === itemId)
      return !found || !dismissedSelection.current.ids.has(found.image.id)
    })
    setAttachments(previous => {
      const synced = syncSelectedCanvasAttachments(previous, autoSelectedIds.current, effectiveSelected, canvasImages)
      autoSelectedIds.current = synced.autoIds
      if (synced.attachments.length === previous.length && synced.attachments.every((att, idx) => att.image.id === previous[idx]?.image.id)) {
        return previous
      }
      return synced.attachments
    })
  }, [selected, canvasImages])
  const selectedGenIds = useMemo(
    () => items.filter((i) => selected.includes(i.id) && i.ref.type === 'generation').map((i) => i.ref.id),
    [items, selected]
  )
  const addToChat = (ids: string[]) => {
    const add = canvasImages.filter((c) => ids.includes(c.id)).map<ChatAttachment>((c) => ({ kind: 'canvas', id: c.id, label: c.label, image: c.image }))
    setAttachments(a => mergeAttachments(a, add))
    if (add.length) { setChatCollapsed(false); toast(`已添加到聊天（最多 8 张）`) }
    else toast('请先选择已完成的图片')
  }
  const addAtts = (atts: ChatAttachment[]) => setAttachments((a) => mergeAttachments(a, atts))
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
  const runTool = async (toolId: string, ids: string[], params?: ToolParams, anchorId?: string) => {
    if (!project || toolSubmitting) return
    const [base, opt] = toolId.split(':')
    const def = tools?.find((t) => t.id === base)
    const name = (def?.name ?? base) + (opt ? ` ${def?.options?.find((o) => o.id === opt)?.label ?? opt}` : '')
    if (def?.editor) { toast(def.fields?.length ? `${name}：已另存为新图（mock，未真正处理）` : `${name}：画布编辑器还没接，先占位`); return }
    if (ds.watchToolRuns && !def?.backendToolId && base !== 'outpaint') { toast(`${name}：该工具还在准备中`); return }
    toast(base === 'describe' ? `${name}：结果会出现在对话里` : `${name}：已开始${ds.watchToolRuns ? '' : '（mock）'}`)
    batch.current = null
    try {
      setToolSubmitting(true)
      await flushCurtain()
      const receive = anchorId ? regenerationEvents(anchorId, () => itemsRef.current, event => {
        if (routeId.current === project.id) onEvent(event)
      }, placed => {
        if (routeId.current === project.id) receiveItems(current => current.map(item => item.id === placed.id ? { ...item, x: placed.x, y: placed.y } : item))
      }) : onEvent
      await ds.runTool(project.id, toolId, ids, receive, params)
      if (anchorId && routeId.current === project.id) await flushCurtain()
    } catch (error) { toast(error instanceof Error ? error.message : '提交工具任务失败') }
    finally { setToolSubmitting(false) }
  }
  const editImages = async (ids: string[], edit: CanvasEdit) => {
    if (imageEditLock.current) return
    const sources = itemsRef.current.filter(item => ids.includes(item.id))
    if (!sources.length) return
    imageEditLock.current = true; setImageEditing(true)
    const projectId = id
    try {
      const outputs = await editCanvasImages(ds, structuredClone(sources), edit)
      if (routeId.current !== projectId) return
      // Resizing must not resurrect a source deleted while the upload was pending.
      setItems(previous => placeEditedImages(previous, outputs, edit))
      if (edit.kind === 'resize') setAttachments(previous => refreshCanvasAttachments(previous, outputs))
      if (edit.kind !== 'resize') setSelected(outputs.map(item => item.id))
      clearTimeout(focusTimer.current)
      focusTimer.current = setTimeout(() => {
        if (routeId.current === projectId) void rf.fitView({ nodes: outputs.map(item => ({ id: item.id })), padding: canvasFitPad(drawerRef.current), duration: canvasMotionDuration(200), maxZoom: 1 })
      }, 120)
      toast(edit.kind === 'merge' ? '已合并为新图层' : edit.kind === 'resize' ? '已应用图片尺寸' : `已另存 ${outputs.length} 张图片`)
    } catch (error) { if (routeId.current === projectId) toast(error instanceof Error ? error.message : '图片处理失败，请重试') }
    finally { imageEditLock.current = false; setImageEditing(false) }
  }
  const editChatResult = (plan: Extract<RegenerationPlan, { kind: 'chat' }>) => {
    setChatCollapsed(false)
    setAttachments(plan.attachments)
    setAutoTool({ kind: 'chat', prefill: { id: uid('regenerate'), text: plan.text, mode: plan.mode, generation: plan.generation } })
    toast(plan.notice ?? '已带回提示词和引用，编辑后发送')
  }
  const videoFromImage = (cid: string) => {
    const image = canvasImages.find(item => item.id === cid)
    if (!image) return
    setChatCollapsed(false)
    setAutoTool({ kind: 'chat', prefill: { id: uid('video'), text: '', mode: 'video', firstFrame: { kind: 'canvas', id: image.id, label: image.label, image: image.image } } })
    toast('已设为视频首帧')
  }
  const download = async (ids: string[], format: 'original' | 'webp' = 'original') => {
    const ready = items.filter(i => ids.includes(i.id) && usableImage(i))
    try {
      for (const item of ready) {
        if (item.video) {
          const a = document.createElement('a')
          a.href = item.video.url.startsWith('/api/') ? `${item.video.url}?download=1` : item.video.url
          a.download = `视频-${item.id}.mp4`; a.target = '_blank'; a.rel = 'noopener'
          document.body.append(a)
          try { a.click() } finally { a.remove() }
          continue
        }
        const file = await canvasDownload(ds, item, format)
        const url = URL.createObjectURL(file.blob)
        const a = document.createElement('a')
        a.href = url; a.download = file.name
        document.body.append(a)
        try { a.click() } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000) }
      }
      toast(ready.length ? `已发起下载 ${ready.length} 个文件` : '请先选择已完成的图片')
    } catch (error) { toast(error instanceof Error ? error.message : '下载失败，请重试') }
  }
  const saveMaterial = async (ids: string[]) => {
    if (!project) return
    const ready = items.filter(i => ids.includes(i.id) && usableImage(i))
    if (!ready.length) { toast('请先选择已完成的图片'); return }
    try {
      await flushCurtain()
      const results = await Promise.allSettled(ready.map(item => ds.saveCanvasMaterial(project.id, item.id)))
      const count = results.filter(result => result.status === 'fulfilled').length
      const failure = results.find(result => result.status === 'rejected')
      toast(failure?.status === 'rejected' ? `已保存 ${count}/${ready.length} 张；${failure.reason instanceof Error ? failure.reason.message : '其余保存失败，请重试'}` : `已存为素材 ${count} 张`)
    } catch (error) { toast(error instanceof Error ? error.message : '存为素材失败，请重试') }
  }
  const setCover = async (cid: string) => {
    if (!project) return
    try {
      await flushCurtain()
      const updated = await ds.setProjectCover(project.id, cid)
      if (routeId.current === project.id) setProject(updated)
      toast('已设为项目封面')
    } catch (error) { toast(error instanceof Error ? error.message : '设置封面失败，请重试') }
  }

  /** 点消息内图片：切到分栏并在画布上选中、居中这张图 */
  const focusResult = useCallback((genId: string, messageId?: string) => {
    const it = itemsRef.current.find(
      (i) => (i.ref.type === 'generation' && i.ref.id === genId) || i.id === genId || i.image.id === genId
    )
    if (!it) { toast('画布中找不到这张图片'); return }
    if (messageId) setFocusedMessageId(messageId)
    clearTimeout(focusTimer.current)
    setView('split')
    const compact = window.matchMedia('(max-width: 820px)').matches
    setChatCollapsed(compact)
    if (compact) setRefCollapsed(true)
    setSelected([it.id])
    requestAnimationFrame(() => {
      rf.fitView({ nodes: [{ id: it.id }], padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1.75 })
    })
  }, [rf, setView, toast])

  const historyRequest = searchParams?.get('reuse') ?? searchParams?.get('generation')
  const reuseHistory = Boolean(searchParams?.get('reuse'))
  const referenceHistory = searchParams?.get('reference') === '1'
  const handledHistory = useRef<string | null>(null)
  useEffect(() => {
    if (!historyRequest || !project || project.id !== id || !tools || !loaded) return
    const key = `${id}:${reuseHistory}:${referenceHistory}:${historyRequest}`
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
        if (referenceHistory) {
          const attachment: ChatAttachment = result
            ? { kind: 'canvas', id: result.id, label: '生成作品', image: result.image }
            : { kind: 'material', id: g.id, label: '生成作品', image: g.image }
          setAttachments(previous => mergeAttachments(previous, [attachment]))
          setChatCollapsed(false)
          toast('已添加到对话参考图')
        }
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
  }, [historyRequest, reuseHistory, referenceHistory, project, id, tools, loaded, ds, focusResult, toast])

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

  const activeReferences = useMemo(() => extractActiveReferences(messages, focusedMessageId), [messages, focusedMessageId])
  const panelReferences = useMemo(() => activeReferences.length ? activeReferences : extractActiveReferences(messages, focusedMessageId, true), [activeReferences, messages, focusedMessageId])
  const referencePanelCollapsed = refCollapsed ?? panelReferences.length === 0

  const handleCollapseRefChange = useCallback((nextCollapsed: boolean) => {
    setRefCollapsed(nextCollapsed)
    setTimeout(() => {
      const selNodes = selected.map((sid) => ({ id: sid }))
      if (selNodes.length === 1) {
        rf.fitView({ nodes: selNodes, padding: canvasFitPad(drawerRef.current), duration: 280, maxZoom: 1.75 })
      } else {
        rf.fitView({ padding: canvasFitPad(drawerRef.current), duration: 280, maxZoom: 1 })
      }
    }, 320)
  }, [rf, selected])

  const handleUploadReference = useCallback(async () => {
    const files = (await pickFiles()).filter(file => file.type.startsWith('image/'))
    if (!files.length) return
    if (attachments.length >= COMPOSER_REFERENCE_LIMIT) {
      toast('每条消息最多引用 8 张不同图片')
      return
    }
    try {
      const uploaded = await Promise.all(files.map(async file => {
        if (ds.uploadChatAttachment) return ds.uploadChatAttachment(file)
        const material = await ds.uploadMaterial(file)
        return { kind: 'material', id: material.id, label: material.name, image: material.image } satisfies ChatAttachment
      }))
      if (routeId.current !== id) return
      setAttachments(previous => mergeAttachments(previous, uploaded))
      setChatCollapsed(false)
      toast(uploaded.length === 1 ? `已添加参考图「${uploaded[0].label}」` : `已添加 ${uploaded.length} 张参考图`)
    } catch (error) {
      toast(error instanceof Error ? error.message : '上传参考图失败，请重试')
    }
  }, [attachments.length, ds, id, toast])

  const handleSelectReference = useCallback((attachment: ChatAttachment, index: number) => {
    const match = findCanvasItemForReference(attachment, itemsRef.current)
    if (match) {
      setSelected([match.id])
      requestAnimationFrame(() => {
        rf.fitView({ nodes: [{ id: match.id }], padding: canvasFitPad(drawerRef.current), duration: 340, maxZoom: 1.75 })
      })
      return
    }
    const lbItems: LightboxItem[] = panelReferences.map((att) => ({
      id: att.id,
      image: att.image,
      title: att.label,
      prompt: '对话参考图',
      ratio: `${att.image.width}:${att.image.height}`,
      projectId: project?.id,
    }))
    setPreviewState({ items: lbItems, index })
  }, [rf, panelReferences, project?.id])

  const handleAnswerAsk = useCallback(async (ask: AskMessage, selectedKey: string, answerText: string, answers?: import('@/lib/agent/clarification').ClarificationAnswer[]) => {
    if (ask.clarification) {
      if (!project || !ds.respondClarification || !answers) throw new Error('结构化答复暂不可用')
      await ds.respondClarification(project.id, { action: 'answer', runId: ask.clarification.runId, revision: ask.clarification.revision, answers })
      return
    }
    if (await send(answerText.startsWith('Q：') ? answerText : `Q：${ask.question} A：${answerText}`, 'agent', activeReferences) === false) return false
    setMessages((prev) => prev.map((m) => (m.id === ask.id && m.role === 'ask' ? { ...m, answered: { selectedKey, answerText } } : m)))
  }, [send, activeReferences, project, ds])

  const handleSkipAsk = useCallback(async (ask: AskMessage) => {
    if (ask.clarification) {
      if (!project || !ds.respondClarification) throw new Error('跳过暂不可用')
      await ds.respondClarification(project.id, { action: 'abandon', runId: ask.clarification.runId, revision: ask.clarification.revision })
      toast('已跳过，本轮不会生成')
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === ask.id && m.role === 'ask' ? { ...m, skipped: true } : m)))
    toast('已跳过提问')
  }, [toast, project, ds])

  const openLightbox = useCallback((pid: string, comparisonSelection?: readonly string[]) => {
    const target = itemsRef.current.find((i) => i.id === pid)
    if (!target || !usableImage(target)) return
    const usable = itemsRef.current.filter(usableImage)
    const batchItems = target.toolRunId
      ? usable.filter((i) => i.toolRunId === target.toolRunId)
      : usable
    const list = comparisonSelection ? usable.filter(item => comparisonSelection.includes(item.id)) : batchItems.length > 1 ? batchItems : usable
    const lbItems: LightboxItem[] = list.map((it) => {
      const genId = it.ref.type === 'generation' ? it.ref.id : undefined
      const reply = messages.find(message => message.role === 'assistant' && message.results.some(result =>
        result.itemId === it.id || result.id === it.ref.id || result.id === it.id || result.id === it.image.id))
      const metadata = generationMetadata(undefined, reply?.role === 'assistant' ? reply : undefined)
      return {
        ...metadata,
        id: it.id,
        image: it.image,
        title: project?.name ?? '画布图片',
        canvasItemId: it.id,
        prompt: regenerationRecord(it, messages)?.prompt,
        ratio: `${it.image.width}:${it.image.height}`,
        createdAt: it.createdAt,
        favorite: genId ? Boolean(favMap[genId]) : false,
        projectId: project?.id,
        generationId: genId,
      }
    })
    const idx = Math.max(0, lbItems.findIndex((x) => x.id === pid))
    setPreviewState({ items: lbItems, index: idx, comparisonSelection })
  }, [project?.name, project?.id, messages, favMap])

  useEffect(() => {
    if (view !== 'split' || preview) return
    const open = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'c') return
      if (isCanvasInput(event.target) || document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]')) return
      const pair = comparePair(selected, itemsRef.current)
      if (!pair.left || !pair.right) return
      event.preventDefault()
      openLightbox(pair.right.id, [...selected])
    }
    window.addEventListener('keydown', open)
    return () => window.removeEventListener('keydown', open)
  }, [view, preview, selected, openLightbox])

  const previewGenerationId = previewState?.items[previewState.index]?.generationId
  useEffect(() => {
    if (!previewGenerationId) return
    let alive = true
    void ds.getGeneration(previewGenerationId).then(detail => {
      if (!alive || !detail) return
      const g = detail.generation
      const metadata = generationMetadata(g)
      setFavMap(previous => ({ ...previous, [g.id]: Boolean(g.favorite) }))
      setPreviewState(previous => previous ? { ...previous, items: previous.items.map(item => item.generationId === g.id ? {
        ...item, prompt: g.prompt ?? item.prompt, modelName: metadata.modelName ?? item.modelName, ratio: g.ratio ?? item.ratio,
        resolution: g.resolution, createdAt: g.createdAt, outputCount: metadata.outputCount ?? item.outputCount ?? (g.runId || g.taskId ? detail.siblings.length || undefined : undefined),
      } : item) } : null)
    }).catch(() => { if (alive) toast('生成参数读取失败，可继续查看图片') })
    return () => { alive = false }
  }, [ds, previewGenerationId, toast])

  if (loading) {
    return (
      <div className={'cv-root mode-' + view}>
        <aside className={'fp view-' + view} aria-hidden>
          <div className="fh"><Link href="/v2" className="lg"><BrandMark size={15} /></Link><div className="skel-line" style={{ width: 120, marginTop: 0 }} /></div>
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
  if (!project || project.id !== id || loadError) {
    return (
      <div className="cv-root" style={{ display: 'grid', placeItems: 'center' }}>
        <EmptyState
          icon="canvas"
          title={loadError ? '项目加载失败' : '项目不存在'}
          subtitle={loadError ?? '该项目可能已被删除或链接有误'}
          action={loadError
            ? <button className="btn pri" onClick={reload}>重试</button>
            : <button className="btn pri" onClick={() => router.push('/v2')}>回到首页</button>}
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
        (isSplit ? ' has-refs' : '') +
        (isSplit && referencePanelCollapsed ? ' ref-collapsed' : '') +
        (effectiveTool === 'hand' ? ' hand' : '')
      }
    >
      {unconfirmedHome && <div role="status" className="toast">
        消息发送时连接中断，正在核实原请求。
        <button type="button" onClick={() => void ds.refreshAgent?.(id)}>核实进度</button>
      </div>}
      <ChatPanel
        onRetryOutput={ds.retryAgentOutput ? target => ds.retryAgentOutput!(id, target) : undefined}
        onRetryVideo={ds.retryVideoTask ? videoId => ds.retryVideoTask!(id, videoId) : undefined}
        onReviewPlan={ds.reviewImagePlan ? command => ds.reviewImagePlan!(id, command, onEvent) : undefined}
        lifecycle={channel?.projectId === id ? channel.lifecycle : undefined}
        connection={channel?.projectId === id ? channel.connection : undefined}
        prefill={autoTool?.kind === 'chat' ? autoTool.prefill : undefined}
        project={project}
        messages={messages}
        attachments={attachments}
        onAttachmentsChange={handleAttachmentsChange}
        onSend={(t, m, submission) => send(t, m, composerAttachments(m, attachments, submission?.firstFrame), submission)}
        onAnswerAsk={handleAnswerAsk}
        onSkipAsk={handleSkipAsk}
        canvasImages={canvasImages}
        busy={busy || turnRunning}
        preparing={!readiness.channel || (pending.current?.projectId === id && pending.current.state.status === 'queued')}
        outputting={chatSending || turnRunning}
        onStop={ds.stopMessage && turnRunning ? stop : undefined}
        onVerify={ds.refreshAgent ? () => {
          if ([401, 403, 404].includes(channel?.failure?.status ?? 0)) window.location.reload()
          else return ds.refreshAgent!(project.id)
        } : undefined}
        stopping={stopping}
        drawerOpen={drawer && !drawerClosing}
        onToggleDrawer={toggleDrawer}
        onRename={async (name) => {
          manualTitleRef.current = true
          try { localStorage.setItem(MANUAL_TITLE_KEY(project.id), '1') } catch {}
          await ds.renameProject(project.id, name)
          setProject((prev) => prev ? { ...prev, name } : prev)
        }}
        onProjectRenamed={name => {
          manualTitleRef.current = true
          try { localStorage.setItem(MANUAL_TITLE_KEY(project.id), '1') } catch {}
          setProject(previous => previous ? { ...previous, name } : previous)
        }}
        creatingProject={creatingProject}
        onProjectDeleted={() => router.push('/v2')}
        onNewProject={newProject}
        onFocusResult={focusResult}
        onOpenReferences={(messageId) => {
          if (messageId) setFocusedMessageId(messageId)
          setView('split')
          setRefTab('refs')
          handleCollapseRefChange(false)
        }}
        view={view}
        collapsed={chatCollapsed}
        onCollapseChange={handleCollapseChange}
        onViewChange={setView}
        selectedGenIds={selectedGenIds}
        avatar={account?.avatar}
      />

      {isSplit && (
        <header className="cv-topbar" aria-label="画布顶栏">
          <div className="cv-topbar-l">
            {chatCollapsed && (
              <div className="cv-collapsed-bar">
                <Link href="/v2" className="lg" title="回到首页" aria-label="回到首页"><BrandMark size={15} /></Link>
                <ProjectHistory currentId={project.id} onCurrentDeleted={() => router.push('/v2')} onRenamed={(pid, name) => { if (pid === project.id) setProject(previous => previous ? { ...previous, name } : previous) }} />
                <CollapsedProjectMenu project={project} creating={creatingProject} onNewProject={newProject} onRenamed={name => { manualTitleRef.current = true; setProject(previous => previous ? { ...previous, name } : previous) }} />
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
                <span className="cv-top-dv" aria-hidden />
              </div>
            )}
            <button
              type="button"
              className={'cv-top-ibtn' + (!referencePanelCollapsed && refTab === 'refs' ? ' on accent' : '')}
              onClick={() => {
                if (referencePanelCollapsed) {
                  setRefTab('refs')
                  handleCollapseRefChange(false)
                } else if (refTab !== 'refs') {
                  setRefTab('refs')
                } else {
                  handleCollapseRefChange(true)
                }
              }}
              title={referencePanelCollapsed ? '展开参考面板' : '参考图片'}
              aria-label={referencePanelCollapsed ? '展开参考面板' : '参考图片'}
              aria-pressed={!referencePanelCollapsed && refTab === 'refs'}
              data-testid={referencePanelCollapsed ? 'expand-ref-btn' : undefined}
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              type="button"
              className={'cv-top-ibtn' + (!referencePanelCollapsed && refTab === 'materials' ? ' on' : '')}
              onClick={() => {
                if (referencePanelCollapsed) {
                  setRefTab('materials')
                  handleCollapseRefChange(false)
                } else if (refTab !== 'materials') {
                  setRefTab('materials')
                } else {
                  handleCollapseRefChange(true)
                }
              }}
              title="我的素材"
              aria-label="我的素材"
              aria-pressed={!referencePanelCollapsed && refTab === 'materials'}
            >
              <Icon name="sparkles" size={16} />
            </button>
            <button
              type="button"
              className={'cv-top-ibtn' + (drawer && !drawerClosing ? ' on' : '')}
              onClick={toggleDrawer}
              title="资产库"
              aria-label="资产"
              aria-pressed={drawer && !drawerClosing}
            >
              <Icon name="asset" size={16} />
            </button>
            <Link href="/v2/tools" className="cv-top-ibtn" title="AI 工具广场" aria-label="AI 工具">
              <Icon name="wand" size={16} />
            </Link>
            <span className="cv-top-dv" aria-hidden />
            <span className="cv-page-pill" title={project.name}>
              <Icon name="canvas" size={14} />
              <span>Page 1</span>
            </span>
            <button
              type="button"
              className="cv-top-ibtn"
              title="新建项目"
              aria-label="新建项目"
              disabled={creatingProject}
              onClick={newProject}
            >
              <Icon name="plus" size={15} />
            </button>
          </div>
          <div className="cv-topbar-r">
            <span className="cv-top-stat tnum" title={`当前画布 ${items.length} 个元素`}>
              <Icon name="zap" size={13} />
              <span>{items.length}</span>
            </span>
            <AccountMenu compact />
            <ExportDialog project={project} items={items} selected={selected} />
          </div>
        </header>
      )}

      {isSplit && (
        <ReferencePanel
          references={panelReferences}
          previous={!activeReferences.length && panelReferences.length > 0}
          items={items}
          selectedIds={selected}
          hidden={referencePanelCollapsed}
          tab={refTab}
          onTabChange={setRefTab}
          onUploadReference={() => void handleUploadReference()}
          onCollapse={() => handleCollapseRefChange(true)}
          onSelectReference={handleSelectReference}
          onAddMaterial={attachment => {
            if (attachments.some(item => item.image.id === attachment.image.id)) { toast('这张素材已添加到输入框'); return }
            if (attachments.length >= COMPOSER_REFERENCE_LIMIT) { toast('每条消息最多引用 8 张不同图片'); return }
            setAttachments(previous => mergeAttachments(previous, [attachment]))
            setChatCollapsed(false)
            toast('已添加到输入框')
          }}
        />
      )}

      <div className="cv-stage" inert={!isSplit} aria-hidden={!isSplit || undefined} style={canvasBg ? { '--cv': canvasBg } as React.CSSProperties : undefined}>
        <BatchProvider key={project.id} projectId={project.id} items={items} tools={tools ?? []}
          onEvent={onEvent} onRunningChange={setToolSubmitting}
          prepare={async () => {
            batch.current = null
            await flushCurtain()
          }}>
        <Board
          key={project.id}
          items={items}
          selected={selected}
          tool={effectiveTool}
          focusId={focusId}
          active={isSplit && !preview}
          drawerOpen={drawer && !drawerClosing}
          canvasBg={canvasBg}
          onCanvasBg={setCanvasBg}
          onBeginMove={() => hist.current.beginMove()}
          onEndMove={endMove}
          tools={(tools ?? []).map(def => ds.getToolPricing ? { ...def, cost: toolPricing?.perOutput } : def)}
          messages={messages}
          toolSubmitting={toolSubmitting}
          onItems={(n, commit) => setItems(n, commit)}
          onSelect={setSelected}
          onRunTool={runTool}
          onEditTool={(toolId, itemId, params, anchorId, notice) => { focusResult(itemId); setAutoTool({ toolId, itemId, params, anchorId, notice, previewOnly: true }) }}
          onEditChat={editChatResult}
          onRetryTool={ds.retryToolRun || ds.retryVideoTask || ds.retryAgentOutput ? (runId, item) => {
            if (item?.agentRetry) return ds.retryAgentOutput?.(project.id, item.agentRetry)
            if (item?.mediaType === 'video') return ds.retryVideoTask?.(project.id, runId)
            return ds.retryToolRun?.(project.id, runId, onEvent)
          } : undefined}
          onAddToChat={addToChat}
          onDownload={download}
          onImageEdit={editImages}
          imageEditing={imageEditing}
          onVideo={videoFromImage}
          onSaveMaterial={saveMaterial}
          onSetCover={setCover}
          onPreview={(pid) => openLightbox(pid)}
          onCompare={pid => openLightbox(pid, [pid])}
          onDropAsset={(raw, at) => place([JSON.parse(raw) as ChatAttachment], at)}
          onDropFiles={placeFiles}
          onUpload={async () => placeFiles(await pickFiles())}
          autoTool={autoTool?.kind === 'chat' ? null : autoTool}
        />
        </BatchProvider>

        {drawer && <AssetDrawer projectId={project.id} closing={drawerClosing} onClose={closeDrawer} onAddToChat={addAtts} onPlace={(a) => place(a)} />}

        {focusId && <div className="nav-focus-banner" role="status"><Icon name="focus" size={15} />焦点编辑 · Esc 退出<button type="button" onClick={exitFocus} aria-label="退出焦点编辑"><Icon name="x" size={15} /></button></div>}
        <CanvasTools project={project} items={items} selected={selected} tool={effectiveTool} onTool={setTool}
          focused={Boolean(focusId)} onFocus={() => {
            if (focusId) { exitFocus(); return }
            const item = selected.length === 1 ? items.find(item => item.id === selected[0] && usableImage(item)) : undefined
            if (!item) { toast('请先选中一张已完成的图片'); return }
            focusViewport.current = rf.getViewport()
            setFocusId(item.id); setTool('select')
            void rf.fitView({ nodes: [{ id: item.id }], padding: canvasFitPad(drawerRef.current), duration: canvasMotionDuration(250), maxZoom: 1.75 })
          }} onUpload={async () => placeFiles(await pickFiles())}
          past={historyCounts.past} future={historyCounts.future} onUndo={undo} onRedo={redo} />

      </div>

      {previewState && (
        <Lightbox
          items={previewState.items.map((it) => ({
            ...it,
            favorite: it.generationId ? Boolean(favMap[it.generationId]) : it.favorite,
          }))}
          index={previewState.index}
          comparison={{ items, selection: previewState.comparisonSelection, initial: Boolean(previewState.comparisonSelection), onNavigate: openLightbox }}
          onIndexChange={(idx) => setPreviewState((s) => (s ? { ...s, index: idx } : null))}
          onClose={() => setPreviewState(null)}
          onDownload={(it) => {
            if (itemsRef.current.some((x) => x.id === it.id)) {
              download([it.id])
              return
            }
            const a = document.createElement('a')
            a.href = it.image.url
            a.download = `图片-${it.image.id}.png`
            a.target = '_blank'
            a.rel = 'noopener'
            a.click()
            toast('已发起下载')
          }}
          onToggleFavorite={async (it) => {
            if (!it.generationId) { toast('仅生成的作品支持收藏'); return }
            const next = !favMap[it.generationId]
            try {
              await ds.setGenerationFavorite([it.generationId], next)
              setFavMap((m) => ({ ...m, [it.generationId!]: next }))
              toast(next ? '已收藏' : '已取消收藏')
            } catch {
              toast('收藏操作失败，请重试')
            }
          }}
          onUseAsReference={(it) => {
            if (itemsRef.current.some((x) => x.id === it.id)) {
              addToChat([it.id])
            } else {
              const matchedRef = activeReferences.find((a) => a.image.id === it.image.id || a.id === it.id)
              addAtts([matchedRef ?? { kind: 'material', id: it.id, label: it.title ?? '参考图', image: it.image }])
              toast('已添加到对话')
            }
            setPreviewState(null)
          }}
          onRegenerate={async (it) => {
            const target = itemsRef.current.find(item => item.id === it.id)
            if (!target || target.ref.type !== 'generation') {
              toast('请选择已完成的生成结果再生成')
              return
            }
            const detail = await ds.getGeneration(target.ref.id)
            if (routeId.current !== project.id) return
            const plan = regeneratePlan(target, itemsRef.current, regenerationRecord(target, messages, detail?.generation))
            if (plan.kind === 'unavailable') { toast(plan.reason); return }
            if (plan.kind === 'chat') {
              setPreviewState(null)
              editChatResult(plan)
              return
            }
            const def = tools?.find(tool => tool.id === plan.toolId.split(':')[0])
            if (!def || def.editor) { toast('原工具当前不可用'); return }
            const input = regenerationToolInput(plan, def)
            setPreviewState(null); setView('split')
            if (input.needsEdit) {
              setSelected([plan.sourceIds[0]])
              setAutoTool({ toolId: plan.toolId, itemId: plan.sourceIds[0], params: plan.params, anchorId: target.id, notice: regenerationNotice(plan) ?? input.reason, previewOnly: true })
            } else await runTool(plan.toolId, plan.sourceIds, input.params, target.id)
          }}
        />
      )}
      <TaskTray />
    </div>
    </GenerationStateProvider>
  )
}
