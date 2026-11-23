'use client'
import * as Popover from '@radix-ui/react-popover'
import React, { useEffect, useSyncExternalStore, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { composerOptions, COMPOSER_PREFERENCES_KEY, defaultGeneration, normalizeGeneration, type ComposerGeneration } from '@/lib/v2/composer-options'
import { defaultVideoGeneration, fitVideoImageMode, frameRatioLocked, normalizeSelectableVideoGeneration, videoImageLimit, videoInputError, videoModelName, videoModelSpec, videoRatioText, type VideoGeneration, type VideoImageMode } from '@/lib/v2/video-options'
import { createValueStore } from '@/lib/v2/value-store'
import { VideoReferenceInput } from './video-reference-input'
import { seedancePrompt } from '@/lib/v2/video-image-mentions'
import { ComposerTextInput, QuickTextInput } from './composer-text-input'
import { composerModeKey, normalizeAgentMode } from '@/lib/v2/agent-mode'
import { COMPOSER_REFERENCE_LIMIT, mergeAttachments, mentionAt, missingToolFields, readDroppedAttachment, referenceChoices, REFERENCE_GROUPS, removeMention } from '@/lib/v2/composer-input'
import type { AgentMode, ChatAttachment, ImageRef, ToolDef, ToolParams } from '@/lib/v2/types'
import type { ComposerPrefill } from '@/lib/v2/regenerate-draft'
import { buildStructuredContents, type ComposerPromptQuote, type ComposerSkillSelection, type StructuredContentBlock } from '@/lib/v2/structured-input'
import { Icon, modelIconName } from './icons'
import { MaskBrushDialog } from './mask-brush-dialog'
import { pickFiles, useToast } from './ui'
import { useV2Auth } from './auth'
import { defaultParams, ToolFieldControl } from './canvas/tool-panel'
import { AGENT_MODEL_AUTO_KEY, AGENT_SPEC_AUTO_KEY, ComposerParameters, MODES, type ParameterPanel } from './composer-parameters'

export { MODES } from './composer-parameters'
export interface ComposerSubmission {
  generation: ComposerGeneration
  caseId?: string
  /** 视频模式：首帧（默认取共用附件第 1 张） */
  videoAttachments?: ChatAttachment[]
  firstFrame?: ChatAttachment
  tool?: { id: string; params: ToolParams }
  skill?: ComposerSkillSelection
  promptQuote?: ComposerPromptQuote
  contents?: StructuredContentBlock[]
}
export interface ComposerProps {
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  onAttachmentLimitChange?: (limit: number) => void
  onSend: (text: string, mode: AgentMode, submission: ComposerSubmission) => void | boolean | Promise<void | boolean>
  canvasImages?: { id: string; label: string; image: ImageRef }[]
  promptQuote?: ComposerPromptQuote | null
  onClearPromptQuote?: () => void
  busy?: boolean
  preparing?: boolean
  onStop?: () => void
  stopping?: boolean
  placeholder?: string
  autoFocus?: boolean
  prefill?: ComposerPrefill
  hero?: boolean
  floating?: boolean
  canvas?: boolean
  draft?: { text: string; seq: number; mode?: AgentMode } | null
  projectId?: string
  initialMode?: AgentMode
}

const VIDEO_PREFERENCES_KEY = 'v2:video-preferences:v1'
const GUEST_OPTIONS = composerOptions()
const HERO_SUGGESTIONS = [
  '上传商品图，生成一组保留版型与面料细节的模特主图',
  '把白底平铺图穿到模特身上，生成自然光街拍大片',
  '基于这件商品，出一套多机位电商主图',
  '为新款针织开衫制作一套统一版式的商品详情页套图',
]
type Panel = ParameterPanel | 'refs' | 'materials' | 'presets' | 'tools' | 'skills' | 'add' | null
const AUTH_PANELS = new Set<Panel>(['refs', 'materials', 'presets'])
const AGENT_PRESET_SKILLS: ComposerSkillSelection[] = [
  { id: 'fashion-visual-shoot', name: '时尚商拍主图' },
  { id: 'product-detail-page', name: '商品详情页套图' },
  { id: 'model-try-on', name: '模特试穿换装' },
  { id: 'clone-product-layout', name: '智能仿版构图' },
  { id: 'garment-redesign', name: '服装参考改款' },
  { id: 'amazon-listing-images', name: '亚马逊 Listing 套图' },
  { id: 'image-upscale', name: '高清超分增强' },
  { id: 'prompt-reverse', name: '反推提示词' },
]

export const Composer = React.memo(function Composer({ attachments, onAttachmentsChange, onAttachmentLimitChange, onSend, canvasImages = [], promptQuote, onClearPromptQuote, busy, preparing, onStop, stopping, placeholder, autoFocus, prefill, hero, floating, canvas, draft, projectId, initialMode }: ComposerProps) {
  const ds = useV2()
  const toast = useToast()
  const { user, loading: authLoading, requireAuth } = useV2Auth()
  const id = useId()
  const [maskTarget, setMaskTarget] = useState<ChatAttachment | null>(null)
  const [suggestionIdx, setSuggestionIdx] = useState(0)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const uploadLock = useRef(false)
  const pickerOpen = useRef(false)
  const uploadQueue = useRef<File[]>([])
  const uploadedIds = useRef(new Map<string, string>())
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const sendLock = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [inputText] = useState(() => createValueStore(''))
  const textKind = useSyncExternalStore(inputText.subscribe, () => {
    const value = inputText.getSnapshot()
    return !value ? 'empty' : value.trim() ? 'content' : 'whitespace'
  }, () => 'empty')
  const updateText = inputText.set
  const textRevision = useRef(0)
  const setText = (value: string) => { textRevision.current++; updateText(value) }
  const [previousText, setPreviousText] = useState<string>()
  const [optimizing, setOptimizing] = useState(false)
  const [presetVersion, setPresetVersion] = useState(0)
  const presets = useLoad(d => d.listPromptPresets(), [user?.id, presetVersion], !!user)
  const [mode, setMode] = useState<AgentMode>('agent')
  const modeKey = composerModeKey(user?.id, projectId)
  const [modeReadyKey, setModeReadyKey] = useState<string>()
  const [generation, setGeneration] = useState(defaultGeneration)
  const [videoParams, setVideoParams] = useState<VideoGeneration>(defaultVideoGeneration)
  const parkedImages = useRef<ChatAttachment[]>([])
  const [orphanTailId, setOrphanTailId] = useState<string>()
  const [agentAuto, setAgentAutoState] = useState(true)
  const [agentRatioAuto, setAgentRatioAutoState] = useState(true)
  const [agentCountAuto, setAgentCountAutoState] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(AGENT_MODEL_AUTO_KEY) === '0') setAgentAutoState(false)
      const specAuto: unknown = JSON.parse(localStorage.getItem(AGENT_SPEC_AUTO_KEY) ?? 'null')
      if (specAuto && typeof specAuto === 'object') {
        if ('ratioAuto' in specAuto && typeof specAuto.ratioAuto === 'boolean') setAgentRatioAutoState(specAuto.ratioAuto)
        if ('countAuto' in specAuto && typeof specAuto.countAuto === 'boolean') setAgentCountAutoState(specAuto.countAuto)
      }
    } catch { /* 隐私模式忽略 */ }
  }, [])

  const setAgentAuto = (value: boolean) => {
    setAgentAutoState(value)
    try { localStorage.setItem(AGENT_MODEL_AUTO_KEY, value ? '1' : '0') } catch { /* 忽略 */ }
  }
  const setAgentRatioAuto = (value: boolean) => {
    setAgentRatioAutoState(value)
    try { localStorage.setItem(AGENT_SPEC_AUTO_KEY, JSON.stringify({ ratioAuto: value, countAuto: agentCountAuto })) } catch { /* 忽略 */ }
  }
  const setAgentCountAuto = (value: boolean) => {
    setAgentCountAutoState(value)
    try { localStorage.setItem(AGENT_SPEC_AUTO_KEY, JSON.stringify({ ratioAuto: agentRatioAuto, countAuto: value })) } catch { /* 忽略 */ }
  }

  const [preferencesReady, setPreferencesReady] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [canvasOnlyRefs, setCanvasOnlyRefs] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [drag, setDrag] = useState(false)
  const [toolSelection, setSelectedTool] = useState<ToolDef | null>(null)
  const selectedTool = mode === 'image' ? null : toolSelection
  const [mountedSkill, setMountedSkill] = useState<ComposerSkillSelection | null>(null)
  const [toolParams, setToolParams] = useState<ToolParams>({})
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(undefined)
  const mention = useRef<ReturnType<typeof mentionAt>>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const composition = useRef(false)
  const { data: tools, error: toolError, loading: toolsLoading, reload: reloadTools } = useLoad(d => d.listTools())
  const appliedPrefill = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!floating) return
    setPanel(null)
    mention.current = null
  }, [floating])

  useEffect(() => {
    if (!preferencesReady || modeReadyKey !== modeKey || !prefill || appliedPrefill.current === prefill.id || (prefill.toolId && !tools)) return
    appliedPrefill.current = prefill.id
    if (prefill.mode) setMode(normalizeAgentMode(prefill.mode))
    parkedImages.current = []
    setOrphanTailId(undefined)
    const selectedImage = prefill.videoImage ?? prefill.firstFrame
    if (selectedImage) {
      setVideoParams(value => ({ ...value, imageMode: prefill.firstFrame ? 'frames' : undefined }))
      const rest = attachmentsRef.current.filter(item => item.image.id !== selectedImage.image.id)
      const merged = mergeAttachments([selectedImage], rest, 30)
      attachmentsRef.current = merged
      onAttachmentsChange(merged)
    }
    if (prefill.generation) {
      if (prefill.mode === 'video') setVideoParams({ ...normalizeSelectableVideoGeneration(prefill.generation), imageMode: prefill.generation.imageMode ?? 'frames' })
      else {
        setGeneration(value => ({ ...value, ...prefill.generation }))
        if (prefill.mode === 'agent') {
          if (typeof prefill.generation.ratioAuto === 'boolean') setAgentRatioAutoState(prefill.generation.ratioAuto)
          if (typeof prefill.generation.countAuto === 'boolean') setAgentCountAutoState(prefill.generation.countAuto)
        }
      }
    }
    const tool = prefill.toolId ? tools?.find(tool => tool.id === prefill.toolId) : undefined
    setText(prefill.text); setActiveCaseId(prefill.caseId); setSelectedTool(tool ?? null); setToolParams(tool ? defaultParams(tool) : {}); setPanel(null); setQuery(''); mention.current = null
    requestAnimationFrame(() => { ta.current?.focus({ preventScroll: true }); ta.current?.setSelectionRange(prefill.text.length, prefill.text.length) })
  }, [prefill, preferencesReady, tools, modeReadyKey, modeKey, onAttachmentsChange])

  const optionsLoad = useLoad(d => d.getComposerOptions(), [user?.id], !!user)
  const assets = useLoad(async d => {
    const [products, libraries, materials] = await Promise.allSettled([d.listProducts(), d.getComposerReferences(), d.listMaterials()])
    return {
      products: products.status === 'fulfilled' ? products.value : [], models: libraries.status === 'fulfilled' ? libraries.value.models : [],
      brands: libraries.status === 'fulfilled' ? libraries.value.brandKits : [], materials: materials.status === 'fulfilled' ? materials.value : [],
      failed: [products, libraries, materials].some(result => result.status === 'rejected'),
    }
  }, [user?.id], !!user)

  const options = optionsLoad.data ?? (!user ? GUEST_OPTIONS : undefined)
  const current = options ? normalizeGeneration(generation, options) : generation
  const count = Math.min(current.count, options?.directMaxCount ?? 4, 4)
  const selection = { ...current, count }
  const model = options?.models.find(item => item.id === current.modelId)
  const videoSpec = videoModelSpec(videoParams.modelId)
  const dualMode = Boolean(videoSpec?.maxReferenceImages)
  const firstFrameOnly = videoSpec?.maxFrameImages === 1
  const imageMode = dualMode ? videoParams.imageMode ?? 'reference' : 'frames'
  const inlineVideoRefs = mode === 'video' && imageMode === 'reference' && videoParams.modelId.startsWith('wj-seedance-')
  const imageLimit = mode === 'video' ? videoImageLimit(videoParams.modelId, imageMode) : COMPOSER_REFERENCE_LIMIT
  useEffect(() => { onAttachmentLimitChange?.(imageLimit) }, [imageLimit, onAttachmentLimitChange])
  const visibleImages = attachments.slice(0, imageLimit)
  const missingFirst = imageMode === 'frames' && Boolean(orphanTailId && attachments[0]?.image.id === orphanTailId)
  const firstFrame = imageMode === 'frames' && !missingFirst ? visibleImages[0] : undefined
  const lockedRatio = frameRatioLocked({ ...videoParams, imageMode }, Boolean(firstFrame))
  const submittedMode = !attachments.length && !videoParams.imageMode ? 'frames' : imageMode
  const videoGeneration = { ...videoParams, imageMode: submittedMode } satisfies VideoGeneration
  // 加入参考图后 Grok 只能 ≤10 秒、≤720p：自动收进范围，避免发送按钮静默不可用。
  useEffect(() => {
    if (mode !== 'video') return
    const fitted = fitVideoImageMode({ ...videoParams, imageMode: submittedMode })
    if (fitted.duration !== videoParams.duration || fitted.resolution !== videoParams.resolution) {
      setVideoParams({ ...fitted, imageMode: videoParams.imageMode })
    }
  }, [mode, submittedMode, videoParams])
  function changeVideoParams(next: VideoGeneration, nextMode: VideoImageMode = next.imageMode ?? 'reference') {
    const nextLimit = videoImageLimit(next.modelId, nextMode)
    const all = mergeAttachments(attachmentsRef.current, parkedImages.current, 30)
    const active = all.slice(0, nextLimit)
    parkedImages.current = all.slice(nextLimit)
    attachmentsRef.current = active
    onAttachmentsChange(active)
    setOrphanTailId(undefined)
    setVideoParams({ ...fitVideoImageMode({ ...next, imageMode: nextMode }), imageMode: next.imageMode })
  }

  function mergeInputImages(current: ChatAttachment[], incoming: ChatAttachment[]) {
    if (mode === 'video' && missingFirst && current[0]?.image.id === orphanTailId && incoming.length) {
      return mergeAttachments(incoming.slice(0, 1), current, imageLimit)
    }
    return mergeAttachments(current, incoming, imageLimit)
  }

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(COMPOSER_PREFERENCES_KEY) ?? 'null')
      if (value && typeof value === 'object') {
        if ('generation' in value && value.generation && typeof value.generation === 'object') {
          const g = value.generation
          setGeneration({
            modelId: 'modelId' in g && typeof g.modelId === 'string' ? g.modelId : defaultGeneration.modelId,
            ratio: 'ratio' in g && typeof g.ratio === 'string' ? g.ratio : defaultGeneration.ratio,
            resolution: 'resolution' in g && typeof g.resolution === 'string' ? g.resolution : defaultGeneration.resolution,
            count: 'count' in g && typeof g.count === 'number' ? g.count : defaultGeneration.count,
          })
        }
      }
      const video: unknown = JSON.parse(localStorage.getItem(VIDEO_PREFERENCES_KEY) ?? 'null')
      if (video && typeof video === 'object') {
        setVideoParams(normalizeSelectableVideoGeneration({ ...video, imageMode: undefined }))
      }
    } catch { /* Storage can be unavailable; controls still work for this session. */ }
    setPreferencesReady(true)
    if (autoFocus) ta.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (authLoading || preparing || modeReadyKey === modeKey) return
    try {
      const stored = localStorage.getItem(modeKey) ?? (!projectId && user?.id ? localStorage.getItem(composerModeKey(undefined)) : null)
      setMode(normalizeAgentMode(stored === null ? initialMode : JSON.parse(stored)))
    } catch { setMode(normalizeAgentMode(initialMode)) }
    setModeReadyKey(modeKey)
  }, [modeKey, projectId, user?.id, initialMode, authLoading, preparing, modeReadyKey])

  useEffect(() => {
    if (modeReadyKey !== modeKey) return
    try { localStorage.setItem(modeKey, JSON.stringify(mode)) } catch { /* Mode remains usable without browser storage. */ }
  }, [mode, modeKey, modeReadyKey])

  useEffect(() => {
    if (!preferencesReady || !optionsLoad.data) return
    try { localStorage.setItem(COMPOSER_PREFERENCES_KEY, JSON.stringify({ generation: current })) } catch { /* Session-only preferences. */ }
  }, [preferencesReady, current.modelId, current.ratio, current.resolution, current.count, optionsLoad.data])

  useEffect(() => {
    if (!preferencesReady) return
    try { localStorage.setItem(VIDEO_PREFERENCES_KEY, JSON.stringify(videoParams)) } catch { /* Session-only preferences. */ }
  }, [preferencesReady, videoParams])


  useEffect(() => {
    if (!draft) return
    setText(draft.text)
    if (draft.mode) {
      setMode(draft.mode)
      setSelectedTool(null)
      setActiveCaseId(undefined)
      setPreviousText(undefined)
      setPanel(null)
      mention.current = null
    }
    const focusFrame = requestAnimationFrame(() => {
      ta.current?.focus()
      const len = draft.text.length
      ta.current?.setSelectionRange(len, len)
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [draft])


  const showHeroHint = Boolean(hero && textKind === 'empty' && !attachments.length && !selectedTool && mode === 'agent')
  useEffect(() => {
    if (!showHeroHint) return
    const timer = window.setInterval(() => setSuggestionIdx(i => (i + 1) % HERO_SUGGESTIONS.length), 5500)
    return () => window.clearInterval(timer)
  }, [showHeroHint])

  const references = useMemo(() => referenceChoices(canvasImages, assets.data?.products ?? [], assets.data?.models ?? [], assets.data?.brands ?? [], assets.data?.materials ?? []), [canvasImages, assets.data])
  const q = query.trim().toLocaleLowerCase()
  const referenceGroups: readonly (typeof REFERENCE_GROUPS[number])[] = canvasOnlyRefs
    ? REFERENCE_GROUPS.filter(group => group === '画布上的图')
    : REFERENCE_GROUPS
  const displayReferenceGroups = panel === 'materials' ? REFERENCE_GROUPS.filter(group => group === '素材') : referenceGroups
  const shownRefs = references.filter(row => (panel === 'materials' ? row.group === '素材' : referenceGroups.includes(row.group)) && (!q || `${row.label} ${row.group}`.toLocaleLowerCase().includes(q)))
  const selectableRefs = shownRefs.filter(row => row.attachment && !attachments.some(att => att.image.id === row.image?.id))
  const shownTools = (tools ?? []).filter(tool => tool.surfaces.includes('slash') && (!q || `${tool.name} ${tool.tip ?? ''}`.toLocaleLowerCase().includes(q)))
  const rows = panel === 'refs' || panel === 'materials' ? selectableRefs : shownTools
  const highlighted = rows.length ? Math.min(active, rows.length - 1) : -1
  useEffect(() => { if (highlighted >= 0) pop.current?.querySelector(`[data-row="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' }) }, [highlighted, panel, query])
  useEffect(() => {
    if (!panel || mention.current) return
    const frame = requestAnimationFrame(() => pop.current?.querySelector<HTMLInputElement | HTMLButtonElement>('input, [data-cp-option]:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [panel])

  const addAttachments = (incoming: ChatAttachment[]) => {
    const merged = mergeInputImages(attachmentsRef.current, incoming)
    attachmentsRef.current = merged
    onAttachmentsChange(merged)
    if (attachments.length + incoming.length > imageLimit) toast(`当前最多使用 ${imageLimit} 张图片`)
  }
  const close = () => { setPanel(null); setCanvasOnlyRefs(false); mention.current = null }
  const open = (next: Panel, button?: HTMLButtonElement) => {
    const show = () => {
      mention.current = null; setQuery(''); setActive(0); setCanvasOnlyRefs(false)
      if (button && box.current?.contains(button)) trigger.current = button
      else if (!button) trigger.current = null
      setPanel(currentPanel => currentPanel === next ? null : next)
    }
    if (!user && AUTH_PANELS.has(next)) { close(); void requireAuth(show) }
    else show()
  }
  const clearToken = () => {
    const text = inputText.getSnapshot()
    const cursor = mention.current?.start
    const token = mention.current
    if (token) setText(removeMention(text, token))
    close()
    requestAnimationFrame(() => { ta.current?.focus(); if (cursor !== undefined) ta.current?.setSelectionRange(cursor, cursor) })
  }
  const insertCanvasMention = (label: string) => {
    const text = inputText.getSnapshot()
    const el = ta.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const snippet = `@${label} `
    const next = `${text.slice(0, start)}${snippet}${text.slice(end)}`
    setText(next)
    const caret = start + snippet.length
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(caret, caret) })
  }
  const choose = (index: number) => {
    const text = inputText.getSnapshot()
    if (panel === 'refs' || panel === 'materials') {
      const row = selectableRefs[index]
      if (!row?.attachment) return
      addAttachments([row.attachment])
      if (row.attachment.kind === 'canvas' && mention.current) {
        const token = mention.current
        const inserted = `@${row.attachment.label} `
        const next = `${text.slice(0, token.start)}${inserted}${text.slice(token.end)}`
        const caret = token.start + inserted.length
        setText(next)
        close()
        requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(caret, caret) })
        return
      }
    } else if (panel === 'tools') {
      const tool = shownTools[index]
      if (!tool) return
      setSelectedTool(tool); setToolParams(defaultParams(tool))
    } else return
    clearToken()
  }
  const change = (value: string) => {
    setText(value)
    if (!value.trim()) setActiveCaseId(undefined)
    setCanvasOnlyRefs(false)
    const token = mentionAt(value, ta.current?.selectionStart ?? value.length)
    mention.current = token
    trigger.current = null
    setPanel(token ? token.kind === '/' ? (mode === 'image' || mode === 'video' ? null : 'tools') : token.kind === '*' ? 'materials' : 'refs' : null)
    setQuery(token?.query ?? ''); setActive(0)
  }
  const insertPreset = (content: string) => {
    const text = inputText.getSnapshot()
    const separator = text.trim() ? '\n' : ''
    setText(`${text}${separator}${content}`)
    close(); requestAnimationFrame(() => ta.current?.focus())
  }
  const createPreset = async () => {
    const text = inputText.getSnapshot()
    const name = window.prompt('固定提示词名称')?.trim()
    if (!name) return
    const content = window.prompt('提示词内容', text)?.trim()
    if (!content) return
    try { await ds.createPromptPreset({ name, content }); setPresetVersion(value => value + 1); toast('已保存固定提示词') }
    catch (error) { toast(error instanceof Error ? error.message : '保存失败') }
  }
  const editPreset = async (id: string, name: string, content: string) => {
    const nextName = window.prompt('固定提示词名称', name)?.trim()
    if (!nextName) return
    const nextContent = window.prompt('提示词内容', content)?.trim()
    if (!nextContent) return
    try { await ds.updatePromptPreset(id, { name: nextName, content: nextContent }); setPresetVersion(value => value + 1); toast('固定提示词已更新') }
    catch (error) { toast(error instanceof Error ? error.message : '更新失败') }
  }
  const deletePreset = async (id: string) => {
    if (!window.confirm('删除这条固定提示词？')) return
    try { await ds.deletePromptPreset(id); setPresetVersion(value => value + 1); toast('固定提示词已删除') }
    catch (error) { toast(error instanceof Error ? error.message : '删除失败') }
  }
  const optimize = async () => {
    const text = inputText.getSnapshot()
    if (!text.trim() || optimizing) { if (!text.trim()) toast('请先输入提示词'); return }
    setOptimizing(true)
    try {
      const original = text
      let result: { prompt: string } | undefined
      const completed = await requireAuth(async () => { result = await ds.optimizePrompt(original) })
      if (!completed || !result) return
      setPreviousText(original); setText(result.prompt); toast('提示词已优化，可撤销')
    } catch (error) { toast(error instanceof Error ? error.message : '优化失败，请重试') }
    finally { setOptimizing(false) }
  }
  const missing = selectedTool && mode !== 'video' ? missingToolFields(selectedTool, toolParams) : []
  const needsCanvas = Boolean(selectedTool?.overlay || selectedTool?.editor)
  // 视频支持文生（有词无图）与图生（有首帧可无词）；无图且无词时置灰。
  const hasInput = Boolean(textKind === 'content' || (mode !== 'image' && (attachments.length || selectedTool && mode !== 'video')))
  const videoIssue = mode === 'video' && (missingFirst || videoInputError(videoGeneration, visibleImages.length, textKind === 'content'))
  const disabled = preparing || busy || sending || uploading || !hasInput || Boolean(videoIssue)

  const send = async () => {
    const draftText = inputText.getSnapshot()
    const normalized = inlineVideoRefs ? seedancePrompt(draftText, visibleImages.length) : { prompt: draftText }
    if (normalized.error) { toast(normalized.error); return }
    if (inlineVideoRefs && normalized.prompt.length > 3600) { toast('提示词最多 3600 字'); return }
    const text = normalized.prompt
    if (disabled || sendLock.current || uploadLock.current) return
    const submittedRevision = textRevision.current
    sendLock.current = true; setSending(true)
    close()
    try {
      await requireAuth(async () => {
        if (mode !== 'video' && selectedTool && !attachments.length) throw new Error('先用 @ 选择一张源图，或拖入图片')
        if (missing.length) throw new Error(`请补充：${missing.join('、')}`)
        const revision = submittedRevision
        const submit = async (submission: ComposerSubmission) => {
          const clear = revision === textRevision.current
          if (clear) { updateText('') }
          let sent = false
          try {
            sent = await onSend(mode === 'image' ? text : text.trim(), mode, submission) !== false
            return sent
          } finally {
            if (clear && !sent && revision === textRevision.current) updateText(draftText)
          }
        }
        if (mode === 'video') {
          const videoGen = videoGeneration
          const contents = buildStructuredContents({
            text: text.trim(),
            mode,
            attachments: visibleImages,
            generation: videoGen,
            promptQuote,
          })
          if (await submit({ generation: videoGen, videoAttachments: visibleImages, ...(promptQuote ? { promptQuote } : {}), contents })) {
            parkedImages.current = []
            setOrphanTailId(undefined)
            onClearPromptQuote?.()
          }
          return
        }
        const available = optionsLoad.data ?? await ds.getComposerOptions()
        const normalized = normalizeGeneration(generation, available)
        if (!selectedTool && !available.models.some(item => item.id === normalized.modelId)) throw new Error('暂无可用模型，请稍后重试')
        const agentModel = mode !== 'image' && agentAuto && available.models.some(item => item.id === defaultGeneration.modelId) ? defaultGeneration.modelId : normalized.modelId
        const clampedCount = Math.min(normalized.count, available.directMaxCount, 4)
        const submitted: ComposerGeneration = mode === 'image'
          ? { ...normalized, count: clampedCount }
          : { ...normalized, modelId: agentModel, count: clampedCount, ratioAuto: agentRatioAuto, countAuto: agentCountAuto }
        const skill: ComposerSkillSelection | undefined = mountedSkill ?? (selectedTool ? { id: selectedTool.id, name: selectedTool.name } : undefined)
        const contents = buildStructuredContents({
          text: mode === 'image' ? text : text.trim(),
          mode,
          attachments: attachmentsRef.current,
          generation: submitted,
          skill,
          promptQuote,
        })
        if (await submit({
          generation: submitted,
          ...(activeCaseId && mode !== 'image' ? { caseId: activeCaseId } : {}),
          ...(selectedTool ? { tool: { id: selectedTool.id, params: toolParams } } : {}),
          ...(skill ? { skill } : {}),
          ...(promptQuote ? { promptQuote } : {}),
          contents,
        })) {
          setPreviousText(undefined)
          setActiveCaseId(undefined)
          setSelectedTool(value => value?.id === selectedTool?.id ? null : value)
          onClearPromptQuote?.()
        }
      })
    } catch (error) { toast(error instanceof Error ? error.message : '发送失败，请重试') }
    finally { sendLock.current = false; setSending(false) }
  }

  const upload = async (files?: File[]) => {
    if (!files) {
      if (pickerOpen.current) return
      pickerOpen.current = true
      try { files = await pickFiles() }
      catch { toast('无法打开文件选择器'); return }
      finally { pickerOpen.current = false }
    }
    const images = files.filter(file => file.type.startsWith('image/'))
    if (!images.length) { if (files.length) toast('请选择图片文件'); return }
    const room = imageLimit - attachmentsRef.current.length - uploadQueue.current.length
    if (images.length > room) toast(`当前最多使用 ${imageLimit} 张图片`)
    uploadQueue.current.push(...images.slice(0, Math.max(0, room)))
    setPendingFiles([...uploadQueue.current])
    if (uploadLock.current || !uploadQueue.current.length) return
    uploadLock.current = true
    setUploading(true)
    let added = 0, failed = 0
    try {
      const completed = await requireAuth(async () => {
        const activeIds = new Set(attachmentsRef.current.map(item => item.image.id))
        for (const [key, id] of uploadedIds.current) if (!activeIds.has(id)) uploadedIds.current.delete(key)
        while (uploadQueue.current.length) {
          const batch = [...uploadQueue.current]
          const inFlight = new Map<string, Promise<ChatAttachment>>()
          const requests = batch.map(async file => {
            const bytes = await file.arrayBuffer()
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
            if (uploadedIds.current.has(digest)) return
            // Share one upload for identical bytes, even when both files are selected together.
            let request = inFlight.get(digest)
            if (!request) {
              request = ds.uploadChatAttachment ? ds.uploadChatAttachment(file) : mockFileAttachment(file)
              inFlight.set(digest, request)
            }
            const attachment = await request
            return { digest, attachment: { ...attachment, label: file.name.slice(0, 200) } }
          })
          // Start in parallel but commit in picker order, so the first frame stays deterministic.
          const results = requests.map(request => request.catch(() => null))
          for (const result of results) {
            const ready = await result
            if (ready === null) failed++
            else if (ready && !uploadedIds.current.has(ready.digest)) {
              uploadedIds.current.set(ready.digest, ready.attachment.image.id)
              const next = mergeInputImages(attachmentsRef.current, [ready.attachment])
              added += next.length - attachmentsRef.current.length
              attachmentsRef.current = next
              onAttachmentsChange(next)
            }
            uploadQueue.current.shift()
            setPendingFiles([...uploadQueue.current])
          }
        }
      })
      if (completed) {
        const total = attachmentsRef.current.filter(item => item.kind === 'upload').length
        const result = added ? `已上传 ${total} 张图片` : '图片已在输入框中'
        toast(failed ? `${added ? result + '，' : ''}${failed} 张上传失败，请重新选择` : result)
      }
    } finally {
      uploadQueue.current = []
      setPendingFiles([])
      uploadLock.current = false
      setUploading(false)
    }
  }

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const text = inputText.getSnapshot()
    if (event.nativeEvent.isComposing || composition.current || event.nativeEvent.keyCode === 229) return
    if (panel === 'refs' || panel === 'materials' || panel === 'tools') {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (rows.length) setActive((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); return
      }
      if (event.key === 'Enter') { event.preventDefault(); if (highlighted >= 0) choose(highlighted); return }
      if (event.key === 'Tab') { close(); return }
    }
    if (event.key === 'Escape' && panel) { event.preventDefault(); close(); return }
    if (showHeroHint && !panel && event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      change(HERO_SUGGESTIONS[suggestionIdx] ?? HERO_SUGGESTIONS[0])
      return
    }
    if (event.key === 'Backspace' && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const pos = event.currentTarget.selectionStart
      if (pos > 0) {
        const before = text.slice(0, pos)
        const matchedCanvas = attachments
          .filter(a => a.kind === 'canvas' && a.label)
          .sort((a, b) => b.label.length - a.label.length)
          .find(a => before.endsWith(`@${a.label}`) || before.endsWith(`@${a.label} `))
        if (matchedCanvas) {
          event.preventDefault()
          const suffix = before.endsWith(`@${matchedCanvas.label} `) ? `@${matchedCanvas.label} ` : `@${matchedCanvas.label}`
          const nextPos = pos - suffix.length
          setText(`${text.slice(0, nextPos)}${text.slice(pos)}`)
          requestAnimationFrame(() => ta.current?.setSelectionRange(nextPos, nextPos))
          return
        }
      }
    }
    if (event.key === 'Backspace' && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0 && attachments.length) {
      event.preventDefault(); onAttachmentsChange(attachments.slice(0, -1)); return
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
  }

  const popupKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-cp-option]:not(:disabled)'))
    const index = buttons.findIndex(button => button === document.activeElement)
    const input = event.target instanceof HTMLInputElement
    const delta = event.key === 'ArrowDown' || !input && event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || !input && event.key === 'ArrowLeft' ? -1 : 0
    if (delta) {
      event.preventDefault()
      buttons[index < 0 ? delta > 0 ? 0 : buttons.length - 1 : (index + delta + buttons.length) % buttons.length]?.focus()
    } else if (event.key === 'Enter' && input) {
      event.preventDefault()
      if (panel === 'refs' || panel === 'materials' || panel === 'tools') { if (highlighted >= 0) choose(highlighted) }
      else buttons[0]?.click()
    }
  }

  const control = (key: Panel, label: string, icon: string | null, value?: string) => (
    <button
      type="button"
      title={key === 'model' ? model?.name : key === 'video-model' ? videoModelName(videoParams.modelId) : key === 'prefs' && !agentAuto ? (model?.name ?? label) : label}
      className={'c cp-control-' + key + (value === '' ? ' cp-icon-control' : '') + (panel === key ? ' on' : '')}
      aria-label={label}
      disabled={!preferencesReady}
      aria-expanded={panel === key}
      aria-controls={panel === key ? `${id}-pop` : undefined}
      onClick={event => open(key, event.currentTarget)}
    >
      {icon && <Icon name={icon} size={16} />}
      {value !== '' && <><span>{value ?? label}</span><Icon name="chev" size={10} /></>}
    </button>
  )

  const anchorToTrigger = Boolean(trigger.current?.isConnected && panel && !mention.current)
  const anchor = useMemo(() => ({
    current: {
      getBoundingClientRect: () =>
        (anchorToTrigger ? trigger.current : (ta.current ?? box.current))?.getBoundingClientRect() ?? new DOMRect(),
    },
  }), [anchorToTrigger, panel])
  const popAlignOffset = useMemo(() => {
    if (!panel || panel === 'prefs' || typeof window === 'undefined') return 0
    const maxWidth = panel === 'presets' ? 380 : panel === 'materials' ? 360 : (panel === 'settings' || panel === 'image-spec') ? 348 : 264
    const rect = (anchorToTrigger ? trigger.current : (ta.current ?? box.current))?.getBoundingClientRect()
    if (!rect || !window.innerWidth) return 0
    const width = Math.min(maxWidth, window.innerWidth - 24)
    const overflowRight = rect.left + width - (window.innerWidth - 12)
    return overflowRight > 0 ? -Math.round(overflowRight) : 0
  }, [anchorToTrigger, panel])

  const modeDef = MODES.find(item => item.id === mode) ?? MODES[0]
  const videoPlaceholder = imageMode === 'reference'
    ? attachments.length || videoParams.imageMode ? '描述如何使用参考图，以及画面和运镜' : '描述画面与运镜，也可添加参考图'
    : firstFrameOnly ? '描述画面与运镜，可添加首帧' : '描述画面与运镜，可添加首帧或尾帧'
  const modePlaceholder = mode === 'video' ? videoPlaceholder : '今天想创作什么？'
  const promptPlaceholder = hero && mode === 'image' ? '描述商品和想生成的图像'
    : hero && mode === 'video' ? videoPlaceholder
      : placeholder ?? modePlaceholder
  const isFlatPop = panel === 'agent-ratio' || panel === 'agent-count' || panel === 'video-ratio' || panel === 'video-resolution' || panel === 'video-duration'

  return (
    <Popover.Root open={panel !== null} onOpenChange={value => { if (!value) close() }} modal={false}>
      <Popover.Anchor virtualRef={anchor} />
      <div
        ref={box}
        inert={floating || undefined}
        className={'cp2 cp-upgraded cp-compact cp-mode-' + mode + (hero ? ' cp-hero' : '') + (canvas ? ' cp-canvas' : '') + (drag ? ' drag' : '')}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes('application/x-v2-asset')) { event.preventDefault(); setDrag(true) } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrag(false) }}
        onDrop={event => {
          setDrag(false)
          const raw = event.dataTransfer.getData('application/x-v2-asset')
          if (raw) {
            event.preventDefault(); event.stopPropagation()
            const attachment = readDroppedAttachment(raw)
            if (!attachment) { toast('无法识别这张引用图片'); return }
            close()
            void requireAuth(() => addAttachments([attachment]))
            return
          }
          if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void upload(Array.from(event.dataTransfer.files)) }
        }}
      >
        {selectedTool && mode !== 'video' && (
          <div className="cp-tool" aria-label={`${selectedTool.name}参数`}>
            <div className="cp-tool-h"><Icon name={selectedTool.icon} size={15} /><b>{selectedTool.name}</b><button type="button" aria-label="移除工具" onClick={() => setSelectedTool(null)}><Icon name="x" size={14} /></button></div>
            <p>{selectedTool.tip ?? '沿用画布工具的参数与执行方式。'}{needsCanvas ? ' 发送后在画布继续编辑。' : ''}</p>
            <div className="cp-tool-fields">{(selectedTool.fields ?? []).map(field => <ToolFieldControl key={field.id} f={field} value={toolParams[field.id]} onChange={value => setToolParams(previous => ({ ...previous, [field.id]: value }))}
              refChoices={references.flatMap(row => row.image ? [{ id: row.key, label: row.label, group: row.group === '画布上的图' ? '画布' as const : row.group === '品牌' ? '素材' as const : row.group, image: row.image }] : [])}
              onUploadReference={async () => {
                let image: ImageRef | undefined
                close()
                const [file] = await pickFiles()
                if (!file) return
                await requireAuth(async () => {
                  const material = await ds.uploadMaterial(file)
                  assets.reload(); image = material.image
                })
                return image
              }} />)}</div>
            <small>源图：{selectedTool.surfaces.includes('batch') && attachments.length ? `${attachments.length} 张引用图片` : attachments[0]?.label ?? '用 @ 选择，或拖入图片'}{!selectedTool.fields?.length ? ' · 此工具没有额外参数' : ''}</small>
          </div>
        )}
        <div className={'cp-editor' + (hero ? ' cp-editor-hero' : '')}>
          {hero && mode !== 'video' && (
            <button type="button" className="cp-upload-slot" aria-label="上传商品图" title="上传商品图，也可以直接拖入或粘贴" onClick={() => { close(); void upload(undefined) }}>
              <Icon name="plus" size={18} />
              <span>商品图</span>
            </button>
          )}
          <div className="cp-editor-main">
            {promptQuote?.text && (
              <div className="cp-quote-bar" role="note" aria-label="已引用提示词">
                <span className="cp-quote-label">引用</span>
                <span className="cp-quote-text">{promptQuote.text}</span>
                {onClearPromptQuote && (
                  <button type="button" aria-label="清除引用" onClick={onClearPromptQuote}><Icon name="x" size={11} /></button>
                )}
              </div>
            )}
            {mode === 'video' && (
              <div className="cp-video-inputs" aria-label="视频图片参数">
                {dualMode && <div className="cp-video-image-modes" role="group" aria-label="视频图片模式">
                  {(['reference', 'frames'] as const).map(value => <button key={value} type="button"
                    aria-pressed={imageMode === value} disabled={uploading}
                    onClick={() => changeVideoParams({ ...videoParams, imageMode: value }, value)}>
                    {value === 'reference' ? '参考图' : firstFrameOnly ? '首帧' : '首尾帧'}
                  </button>)}
                </div>}
                <div className="cp-video-slots">
                  {(imageMode === 'reference'
                    ? [...visibleImages, ...(visibleImages.length < imageLimit ? [undefined] : [])]
                    : (dualMode && imageLimit > 1 ? [firstFrame, missingFirst ? visibleImages[0] : visibleImages[1]] : [firstFrame])
                  ).map((att, index) => {
                    const label = imageMode === 'reference' ? `参考图 ${index + 1}` : index === 0 ? '首帧' : '尾帧'
                    return att ? <span className="cp-video-slot" key={att.image.id} title={att.label}>
                      <img src={att.image.thumbUrl ?? att.image.url} alt={att.label} /><span>{label}</span>
                      <button type="button" aria-label={`移除${label}`} onClick={() => {
                        if (imageMode === 'frames' && !index) setOrphanTailId(visibleImages[1]?.image.id)
                        onAttachmentsChange(attachments.filter(item => item.image.id !== att.image.id))
                      }}><Icon name="x" size={11} /></button>
                    </span> : <button className="cp-video-slot cp-video-add" key={label} type="button"
                      aria-label={`添加${label}`} disabled={uploading || (imageMode === 'frames' && index === 1 && !firstFrame)}
                      onClick={() => { close(); void upload() }}><Icon name="plus" size={14} />{label}</button>
                  })}
                </div>
                {imageMode === 'reference' && <small>{visibleImages.length} / {imageLimit} 张</small>}
                {lockedRatio && <small>此模型会按首帧确定视频比例</small>}
                {missingFirst && <small>请补充首帧，或移除尾帧</small>}
              </div>
            )}
            <div className="refs" aria-label="已选引用">
              {mountedSkill && mode === 'agent' && (
                <span className="cp-ref-skill" title={`已挂载技能：${mountedSkill.name}`}>
                  <Icon name="sparkles" size={12} />
                  <em className="cp-ref-badge cp-ref-badge-skill">Skill</em>
                  <span className="cp-ref-name">{mountedSkill.name}</span>
                  <button type="button" aria-label={`移除技能 ${mountedSkill.name}`} onClick={() => setMountedSkill(null)}><Icon name="x" size={11} /></button>
                </span>
              )}
              {mode !== 'video' && attachments.map(attachment => (
                <span
                  key={attachment.image.id}
                  title={attachment.label}
                  className={
                    (attachment.kind === 'canvas' ? 'cp-ref-canvas' : attachment.kind === 'brand' ? 'cp-ref-kit' : '')
                    + (attachment.mask ? ' cp-ref-masked' : '')
                  }
                >
                  <img src={attachment.image.thumbUrl ?? attachment.image.url} alt="" />
                  {attachment.kind === 'canvas' && <em className="cp-ref-badge cp-ref-badge-canvas">画布</em>}
                  {attachment.kind === 'brand' && <em className="cp-ref-badge cp-ref-badge-kit">Kit</em>}
                  {attachment.mask && <em className="cp-ref-badge cp-ref-badge-mask">遮罩</em>}
                  <span
                    className="cp-ref-name"
                    onClick={attachment.kind === 'canvas' ? () => insertCanvasMention(attachment.label) : undefined}
                    title={attachment.kind === 'canvas' ? `点击在正文插入 @${attachment.label}` : attachment.label}
                  >{attachment.label}</span>
                  {attachment.kind !== 'brand' && (
                    <button
                      type="button"
                      className="cp-ref-mask-btn"
                      title={attachment.mask ? '编辑局部涂抹遮罩' : '涂抹局部遮罩'}
                      aria-label={`为 ${attachment.label} 涂抹遮罩`}
                      onClick={() => setMaskTarget(attachment)}
                    >
                      <Icon name="wand" size={11} />
                    </button>
                  )}
                  <button type="button" aria-label={`移除引用 ${attachment.label}`} onClick={() => onAttachmentsChange(attachments.filter(item => item.image.id !== attachment.image.id))}><Icon name="x" size={11} /></button>
                </span>
              ))}
              {pendingFiles.map((file, index) => <span key={`pending-${index}`} aria-label={`正在上传 ${file.name}`}>
                <span className="v2-spinner" aria-hidden /><span className="cp-ref-name">{file.name}</span>
              </span>)}
            </div>
            {maskTarget && (
              <MaskBrushDialog
                attachment={maskTarget}
                onSave={maskUrl => {
                  onAttachmentsChange(attachments.map(item =>
                    item.image.id === maskTarget.image.id
                      ? { ...item, mask: { url: maskUrl, type: 'brush' } }
                      : item
                  ))
                  toast('已应用局部涂抹遮罩')
                }}
                onClear={() => {
                  onAttachmentsChange(attachments.map(item =>
                    item.image.id === maskTarget.image.id
                      ? { ...item, mask: undefined }
                      : item
                  ))
                }}
                onClose={() => setMaskTarget(null)}
              />
            )}
            {inlineVideoRefs ? <VideoReferenceInput
              images={visibleImages} store={inputText} onSend={() => void send()} expandable={!hero}
              onChange={value => { if (value !== inputText.getSnapshot()) setText(value) }}
              placeholder={promptPlaceholder} onFiles={files => void upload(files)}
            /> : <ComposerTextInput
              inputRef={ta}
              textStore={inputText}
              expandable={!hero}
              aria-label="描述需求"
              aria-expanded={panel === 'refs' || panel === 'materials' || panel === 'tools'}
              role="combobox"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-controls={panel === 'refs' || panel === 'materials' || panel === 'tools' ? `${id}-list` : undefined}
              aria-activedescendant={highlighted >= 0 && (panel === 'refs' || panel === 'materials' || panel === 'tools') ? `${id}-row-${highlighted}` : undefined}
              rows={2}
              placeholder={showHeroHint ? '' : promptPlaceholder}
              maxLength={3600}
              onChange={event => change(event.target.value)}
              onKeyDown={keyDown}
              onClick={() => { if (mention.current) change(inputText.getSnapshot()) }}
              onCompositionStart={() => { composition.current = true }}
              onCompositionEnd={() => { composition.current = false }}
              onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.some(file => file.type.startsWith('image/'))) { event.preventDefault(); void upload(files) } }}
              hint={showHeroHint && (
                <div className="cp-hero-hint" aria-hidden="true">
                  <span className="cp-hero-hint-txt">{HERO_SUGGESTIONS[suggestionIdx]}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="cp-tab-key"
                    onMouseDown={event => {
                      event.preventDefault()
                      change(HERO_SUGGESTIONS[suggestionIdx] ?? HERO_SUGGESTIONS[0])
                      ta.current?.focus()
                    }}
                  >
                    Tab
                  </button>
                </div>
              )}
            />}
          </div>
        </div>
        <div className="ctl cp-params" aria-label="生成参数">
          {control('add', '添加图片', 'plus', '')}
          {hero ? (
            <div className="cp-hero-modes" role="group" aria-label="创作模式">
              {MODES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.name}
                  aria-pressed={mode === item.id}
                  title={`${item.name} · ${item.hint}`}
                  disabled={!preferencesReady}
                  onClick={() => { close(); setMode(item.id) }}
                >
                  <Icon name={item.icon} size={17} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ) : control('mode', '模式', modeDef.icon, modeDef.name)}
          {!hero && !canvas && <button type="button" className={'c cp-prompt-control' + (panel === 'presets' ? ' on' : '')} aria-label="固定提示词" aria-expanded={panel === 'presets'} onClick={event => open('presets', event.currentTarget)}><Icon name="paste" size={15} /><span>固定 prompt</span></button>}
          {mode === 'agent' && (
            <>
              {control('agent-ratio', '比例', null, agentRatioAuto ? '比例 自动' : current.ratio)}
              {control('agent-count', '张数', null, agentCountAuto ? '张数 自动' : `${count} 张`)}
              {canvas && control('skills', '挂载技能', 'sparkles', mountedSkill ? mountedSkill.name : '技能')}
            </>
          )}
          {mode === 'image' && (
            <>
              {control('image-spec', '图像规格', null, `${current.resolution.toUpperCase()} · ${current.ratio} · ${count}张`)}
              {control('model', '模型', modelIconName(current.modelId), model?.name ?? (optionsLoad.loading ? '加载中' : '暂无模型'))}
            </>
          )}
          {mode === 'video' && (
            <>
              <button
                type="button"
                className={'c cp-control-video-ratio' + (panel === 'video-ratio' ? ' on' : '')}
                aria-label="比例"
                disabled={lockedRatio}
                title={lockedRatio ? '此模型会按首帧确定视频比例' : '视频宽高比'}
                aria-expanded={panel === 'video-ratio'}
                aria-controls={panel === 'video-ratio' ? `${id}-pop` : undefined}
                onClick={event => open('video-ratio', event.currentTarget)}
              >
                <span>{videoRatioText({ ...videoParams, imageMode }, firstFrame?.image)}</span>
                <Icon name="chev" size={10} />
              </button>
              {control('video-resolution', '清晰度', null, videoParams.resolution.toUpperCase())}
              {control('video-duration', '时长', null, `${videoParams.duration}s`)}
              {control('video-model', '视频模型', modelIconName(videoParams.modelId), videoModelName(videoParams.modelId))}
            </>
          )}
          {((!hero && !canvas) || textKind === 'content' || previousText !== undefined) && mode !== 'video' && (
            previousText !== undefined
              ? <button type="button" className="c cp-prompt-control" aria-label="撤销提示词优化" onClick={() => { setText(previousText); setPreviousText(undefined); ta.current?.focus() }}><Icon name="undo" size={15} /><span>撤销优化</span></button>
              : <button type="button" className="c cp-prompt-control" aria-label="优化提示词" disabled={optimizing} onClick={() => void optimize()}><Icon name="sparkles" size={15} /><span>{optimizing ? '优化中…' : '优化提示词'}</span></button>
          )}
          {!hero && <span className="sp" />}
          <div className="cp-actions">
            {mode === 'agent' && <span className={'cp-prefs-trigger' + (agentAuto ? '' : ' custom')}>{control('prefs', '模型偏好', agentAuto ? 'toolbox' : modelIconName(current.modelId), hero ? (agentAuto ? '模型' : model?.name ?? '模型') : '')}</span>}
            {onStop ? (
              <button type="button" className="go" aria-label={stopping ? '正在停止' : '停止生成'} disabled={stopping} onClick={onStop}><Icon name="x" size={16} /></button>
            ) : (
              <button
                type="button"
                className="go"
                title="发送"
                aria-label={preparing ? '准备中' : uploading ? '图片上传中' : sending ? '正在发送' : '发送'}
                disabled={disabled}
                onClick={() => void send()}
              >
                {preparing || uploading || sending ? <span className="v2-spinner" aria-hidden /> : <Icon name="send" size={16} />}
              </button>
            )}
          </div>
        </div>
        {mode === 'video' && attachments.length > imageLimit && (
          <p className="cp-note cp-video-multi-hint" role="status">
            本次使用前 {imageLimit} 张，其余图片已保留
          </p>
        )}
        {(preparing || uploading) && <p className="cp-note" role="status">{preparing ? '准备中…' : '图片上传中…'}</p>}
        {selectedTool && mode !== 'video' && <p className="cp-note">工具使用上方专属参数；通用胶囊用于下一次对话创作。</p>}
        {!hero && optionsLoad.error && <p className="cp-note" role="status">模型加载失败 <button type="button" onClick={optionsLoad.reload}>重试</button></p>}
      </div>
      {hero && <form
        className="lv-quick-composer"
        data-visible={floating || undefined}
        aria-label="快速发送需求"
        onSubmit={event => { event.preventDefault(); void send() }}
      >
        {(mode !== 'agent' || selectedTool || attachments.length > 0) && (
          <span className="lv-quick-context" title={selectedTool?.name ?? modeDef.name}>
            {selectedTool?.name ?? modeDef.name}{attachments.length > 0 ? ` · ${attachments.length} 张图` : ''}
          </span>
        )}
        <QuickTextInput
          textStore={inputText}
          aria-label="快速描述需求"
          placeholder="描述你的创作需求"
          maxLength={3600}
          rows={1}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
        />
        <button type="submit" aria-label={sending ? '正在发送' : '发送需求'} disabled={disabled}>
          {sending ? <span className="v2-spinner" aria-hidden /> : <Icon name="send" size={16} />}
        </button>
      </form>}
      <Popover.Portal container={box.current?.closest('.v2') ?? undefined}>
        <Popover.Content
          ref={pop}
          id={`${id}-pop`}
          aria-label={panel === 'refs' ? '引用图片' : panel === 'materials' ? '选择素材' : panel === 'presets' ? '固定提示词' : panel === 'tools' ? '选择工具' : panel === 'add' ? '添加图片' : panel === 'prefs' ? '模型偏好' : panel === 'mode' ? '切换模式' : '生成参数'}
          className={
            'composer-pop' +
            (panel === 'mode' ? ' cp-mode-pop' : '') +
            (isFlatPop ? ' cp-flat-spec-pop' : '') +
            (panel === 'materials' ? ' cp-material-picker' : '') +
            (panel === 'presets' ? ' cp-presets-pop' : '') +
            (panel === 'settings' || panel === 'image-spec' ? ' cp-image-settings' : '') +
            (panel === 'prefs' ? ' cp-prefs-pop' : '')
          }
          side="top"
          align={panel === 'prefs' ? 'end' : 'start'}
          alignOffset={popAlignOffset}
          sideOffset={8}
          avoidCollisions={false}
          collisionPadding={12}
          onOpenAutoFocus={event => { if (mention.current) event.preventDefault() }}
          onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else ta.current?.focus() }}
          onInteractOutside={event => { if (box.current?.contains(event.target as Node)) event.preventDefault() }}
          onKeyDown={popupKeys}
        >
          {panel === 'skills' ? <>
            <div className="cp-pop-h"><b>挂载 Agent 技能</b><small>随对话注入 Skill 规范</small></div>
            <div className="cp-options" role="listbox" aria-label="技能列表">
              {AGENT_PRESET_SKILLS.map(skill => {
                const activeSkill = mountedSkill?.id === skill.id
                return (
                  <button
                    key={skill.id}
                    type="button"
                    role="option"
                    aria-selected={activeSkill}
                    data-cp-option
                    className={'cp-option' + (activeSkill ? ' hv' : '')}
                    onClick={() => {
                      setMountedSkill(activeSkill ? null : skill)
                      close()
                    }}
                  >
                    <Icon name="sparkles" size={15} />
                    <span>{skill.name}<small>{activeSkill ? '已挂载 · 点击取消' : '点击挂载到本轮对话'}</small></span>
                    {activeSkill && <Icon name="check" size={12} />}
                  </button>
                )
              })}
            </div>
          </> : (panel === 'refs' || panel === 'materials' || panel === 'tools') ? <>
            <div className="cp-pop-h"><b>{panel === 'refs' ? '引用图片' : panel === 'materials' ? '选择素材' : '选择工具'}</b><small>↑↓ 选择 · Enter 确认</small></div>
            {panel === 'tools' && <button type="button" className="cp-option cp-settings-entry" data-cp-option onClick={() => setPanel('settings')}><Icon name="tune" size={16} /><span>生成设置<small>{model?.name ?? '模型'} · {current.ratio} · {current.resolution.toUpperCase()} · {count} 张</small></span><Icon name="right" size={13} /></button>}
            <div className="cp-search"><Icon name="search" size={14} /><input aria-label={panel === 'tools' ? '搜索工具' : panel === 'materials' ? '搜索素材' : '搜索引用'} placeholder={panel === 'tools' ? '搜索工具名称' : panel === 'materials' ? '搜索素材名称' : '搜索画布、商品、模特…'} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} /></div>
            <div className="cp-options" id={`${id}-list`} role="listbox" aria-label={panel === 'tools' ? '工具列表' : panel === 'materials' ? '素材列表' : '引用列表'}>
              {panel !== 'tools' ? displayReferenceGroups.map(group => <div key={group} role="group" aria-label={group}><div className="cp-group">{group}<small>{shownRefs.filter(row => row.group === group).length}</small></div>
                {shownRefs.filter(row => row.group === group).map(row => { const index = selectableRefs.indexOf(row); const chosen = attachments.some(att => att.image.id === row.image?.id); return <button type="button" role="option" aria-selected={chosen || index === highlighted} disabled={!row.attachment || chosen} data-cp-option data-row={index} id={index >= 0 ? `${id}-row-${index}` : undefined} key={row.key} className={'cp-option' + (index >= 0 && index === highlighted ? ' hv' : '')} onFocus={() => { if (index >= 0) setActive(index) }} onMouseEnter={() => { if (index >= 0) setActive(index) }} onClick={() => choose(index)}>
                  {row.image ? <img src={row.image.thumbUrl ?? row.image.url} alt="" /> : <Icon name="img" size={20} />}<span>{row.label}<small>{chosen ? '已引用' : !row.attachment ? '还没有参考图片' : group}</small></span>{chosen && <Icon name="check" size={12} />}
                </button> })}
                {!shownRefs.some(row => row.group === group) && <p className="cp-empty">{assets.loading && group !== '画布上的图' ? '加载中…' : q ? '没有匹配的图片' : group === '画布上的图' ? '画布图片会出现在这里' : `暂无${group}图片`}</p>}
              </div>) : <>{shownTools.map((tool, index) => <button type="button" role="option" aria-selected={index === highlighted} data-cp-option data-row={index} id={`${id}-row-${index}`} key={tool.id} className={'cp-option' + (index === highlighted ? ' hv' : '')} onFocus={() => setActive(index)} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}><Icon name={tool.icon} size={19} /><span>{tool.name}<small>{tool.tip ?? '选择后填写参数，再发送'}</small></span><Icon name="right" size={12} /></button>)}{!shownTools.length && <p className="cp-empty">{toolsLoading ? '加载工具中…' : toolError ? '工具加载失败' : '没有匹配的工具'}</p>}</>}
            </div>
            {panel === 'refs' && !user && <button type="button" className="cp-retry" onClick={() => { close(); void requireAuth(() => setPanel('refs')) }}>登录后引用你的商品、模特、品牌和素材</button>}
            {panel === 'refs' && assets.data?.failed && <button type="button" className="cp-retry" onClick={assets.reload}>部分资产加载失败，点击重试</button>}
            {panel === 'tools' && toolError && <button type="button" className="cp-retry" onClick={reloadTools}>工具加载失败，点击重试</button>}
          </> : panel === 'presets' ? <>
            <div className="cp-pop-h"><b>固定提示词</b><button type="button" className="cp-preset-add" onClick={() => void createPreset()}><Icon name="plus" size={13} />新增</button></div>
            <div className="cp-options cp-preset-list">
              {(presets.data ?? []).map(preset => <div className="cp-preset-row" key={preset.id}>
                <button type="button" data-cp-option className="cp-option" onClick={() => insertPreset(preset.content)}><Icon name="paste" size={17} /><span><b>{preset.name}</b><small>{preset.content}</small></span></button>
                <button type="button" aria-label={`编辑固定提示词 ${preset.name}`} onClick={() => void editPreset(preset.id, preset.name, preset.content)}><Icon name="type" size={13} /></button>
                <button type="button" aria-label={`删除固定提示词 ${preset.name}`} onClick={() => void deletePreset(preset.id)}><Icon name="trash" size={13} /></button>
              </div>)}
              {!presets.loading && !presets.data?.length && <p className="cp-empty">还没有固定提示词</p>}
            </div>
          </> : panel === 'add' ? <>
            <div className="cp-pop-h"><b>{hero || canvas ? '添加与快捷能力' : '添加图片'}</b></div>
            <button type="button" data-cp-option className="cp-option" onClick={() => { close(); void upload(undefined) }}>
              <Icon name="upload" /><span>上传图片<small>也可以粘贴或拖入图片</small></span>
            </button>
            <button type="button" data-cp-option className="cp-option" onClick={event => open('materials', event.currentTarget)}>
              <Icon name="asset" /><span>素材库<small>选择已保存的素材</small></span>
            </button>
            {(hero || canvas) && mode !== 'video' && <>
              {mode !== 'image' && <button type="button" data-cp-option className="cp-option" onClick={() => { setQuery(''); setActive(0); setPanel('tools') }}>
                <Icon name="grid" /><span>AI 工具<small>调用固定商拍与精修流程</small></span>
              </button>}
              <button type="button" data-cp-option aria-label="固定提示词" className="cp-option" onClick={event => open('presets', event.currentTarget)}>
                <Icon name="paste" /><span>固定提示词<small>插入或管理常用提示词模板</small></span>
              </button>
            </>}
            {!hero && <button type="button" data-cp-option className="cp-option" onClick={() => {
              const show = () => { setCanvasOnlyRefs(true); setQuery(''); setActive(0); setPanel('refs') }
              if (!user) { close(); void requireAuth(show) } else show()
            }}>
              <Icon name="canvas" /><span>从画布选择生成图</span>
            </button>}
          </> : panel ? (
            <ComposerParameters
              key={panel}
              panel={panel}
              options={options}
              generation={selection}
              mode={mode}
              onGenerationChange={setGeneration}
              onModeChange={setMode}
              onPanelChange={setPanel}
              onClose={close}
              agentAuto={agentAuto}
              onAgentAutoChange={setAgentAuto}
              agentRatioAuto={agentRatioAuto}
              onAgentRatioAutoChange={setAgentRatioAuto}
              agentCountAuto={agentCountAuto}
              onAgentCountAutoChange={setAgentCountAuto}
              video={{ ...videoParams, imageMode }}
              videoChoiceMode={submittedMode}
              onVideoChange={next => {
                if (next.modelId !== videoParams.modelId) changeVideoParams(next)
                else setVideoParams({ ...next, imageMode: videoParams.imageMode })
              }}
            />
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})

async function mockFileAttachment(file: File): Promise<ChatAttachment> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取图片'))
    reader.onerror = () => reject(new Error('无法读取图片')); reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片无法解码')); image.src = url })
  const id = crypto.randomUUID()
  return { kind: 'upload', id, label: file.name, image: { id, url, width: image.naturalWidth, height: image.naturalHeight } }
}
