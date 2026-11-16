'use client'
import * as Popover from '@radix-ui/react-popover'
import React, { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { COMPOSER_PREFERENCES_KEY, defaultGeneration, normalizeGeneration, type ComposerGeneration } from '@/lib/v2/composer-options'
import { mergeAttachments, mentionAt, missingToolFields, readDroppedAttachment, referenceChoices, REFERENCE_GROUPS, removeMention } from '@/lib/v2/composer-input'
import type { AgentMode, ChatAttachment, ImageRef, ToolDef, ToolParams } from '@/lib/v2/types'
import { Icon } from './icons'
import { pickFiles, useToast } from './ui'
import { useV2Auth } from './auth'
import { defaultParams, ToolFieldControl } from './canvas/tool-panel'
import { ComposerParameters, MODES, type ParameterPanel } from './composer-parameters'

export { MODES } from './composer-parameters'
export interface ComposerSubmission {
  generation: ComposerGeneration
  tool?: { id: string; params: ToolParams }
}
export interface ComposerProps {
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  onSend: (text: string, mode: AgentMode, submission: ComposerSubmission) => void | boolean | Promise<void | boolean>
  canvasImages?: { id: string; label: string; image: ImageRef }[]
  busy?: boolean
  onStop?: () => void
  stopping?: boolean
  placeholder?: string
  autoFocus?: boolean
}
type Panel = ParameterPanel | 'refs' | 'tools' | 'add' | null

export function Composer({ attachments, onAttachmentsChange, onSend, canvasImages = [], busy, onStop, stopping, placeholder, autoFocus }: ComposerProps) {
  const ds = useV2()
  const toast = useToast()
  const { user, requireAuth } = useV2Auth()
  const id = useId()
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const uploadLock = useRef(false)
  const sendLock = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [generation, setGeneration] = useState(defaultGeneration)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [drag, setDrag] = useState(false)
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(null)
  const [toolParams, setToolParams] = useState<ToolParams>({})
  const mention = useRef<ReturnType<typeof mentionAt>>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const composition = useRef(false)
  const { data: tools, error: toolError, loading: toolsLoading, reload: reloadTools } = useLoad(d => d.listTools())
  const optionsLoad = useLoad(d => d.getComposerOptions(), [user?.id], !!user)
  const assets = useLoad(async d => {
    const [products, libraries, materials] = await Promise.allSettled([d.listProducts(), d.getComposerReferences(), d.listMaterials()])
    return {
      products: products.status === 'fulfilled' ? products.value : [], models: libraries.status === 'fulfilled' ? libraries.value.models : [],
      brands: libraries.status === 'fulfilled' ? libraries.value.brandKits : [], materials: materials.status === 'fulfilled' ? materials.value : [],
      failed: [products, libraries, materials].some(result => result.status === 'rejected'),
    }
  }, [user?.id], !!user)
  const options = optionsLoad.data
  const current = options ? normalizeGeneration(generation, options) : generation
  const count = mode === 'direct' ? Math.min(current.count, options?.directMaxCount ?? 1) : current.count
  const selection = { ...current, count }
  const model = options?.models.find(item => item.id === current.modelId)

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(COMPOSER_PREFERENCES_KEY) ?? 'null')
      if (value && typeof value === 'object') {
        if ('mode' in value && (value.mode === 'agent' || value.mode === 'direct' || value.mode === 'ecom-set')) setMode(value.mode)
        if ('generation' in value && value.generation && typeof value.generation === 'object') {
          const g = value.generation
          setGeneration({ modelId: 'modelId' in g && typeof g.modelId === 'string' ? g.modelId : defaultGeneration.modelId,
            ratio: 'ratio' in g && typeof g.ratio === 'string' ? g.ratio : defaultGeneration.ratio,
            resolution: 'resolution' in g && typeof g.resolution === 'string' ? g.resolution : defaultGeneration.resolution,
            count: 'count' in g && typeof g.count === 'number' ? g.count : defaultGeneration.count })
        }
      }
    } catch { /* Storage can be unavailable; controls still work for this session. */ }
    setPreferencesReady(true)
    if (autoFocus) ta.current?.focus()
  }, [autoFocus])
  useEffect(() => {
    if (!preferencesReady || !options) return
    try { localStorage.setItem(COMPOSER_PREFERENCES_KEY, JSON.stringify({ mode, generation: current })) } catch { /* Session-only preferences. */ }
  }, [preferencesReady, mode, current.modelId, current.ratio, current.resolution, current.count, options])
  useEffect(() => {
    const el = ta.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [text])

  const references = useMemo(() => referenceChoices(canvasImages, assets.data?.products ?? [], assets.data?.models ?? [], assets.data?.brands ?? [], assets.data?.materials ?? []), [canvasImages, assets.data])
  const q = query.trim().toLocaleLowerCase()
  const shownRefs = references.filter(row => !q || `${row.label} ${row.group}`.toLocaleLowerCase().includes(q))
  const selectableRefs = shownRefs.filter(row => row.attachment && !attachments.some(att => att.image.id === row.image?.id))
  const shownTools = (tools ?? []).filter(tool => tool.surfaces.includes('slash') && (!q || `${tool.name} ${tool.tip ?? ''}`.toLocaleLowerCase().includes(q)))
  const rows = panel === 'refs' ? selectableRefs : shownTools
  const highlighted = rows.length ? Math.min(active, rows.length - 1) : -1
  useEffect(() => { if (highlighted >= 0) pop.current?.querySelector(`[data-row="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' }) }, [highlighted, panel, query])
  useEffect(() => {
    if (!panel || mention.current) return
    // Switching pills reuses the same Popover.Content; Radix autofocus only runs
    // when it mounts, so move focus into the newly selected panel as well.
    const frame = requestAnimationFrame(() => pop.current?.querySelector<HTMLInputElement | HTMLButtonElement>('input, [data-cp-option]:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [panel])

  const addAttachments = (incoming: ChatAttachment[]) => {
    const merged = mergeAttachments(attachmentsRef.current, incoming)
    attachmentsRef.current = merged
    onAttachmentsChange(merged)
    if (attachments.length + incoming.length > 10) toast('每条消息最多引用 10 张不同图片')
  }
  const close = () => { setPanel(null); mention.current = null }
  const open = (next: Panel, button?: HTMLButtonElement) => {
    const show = () => {
      mention.current = null; setQuery(''); setActive(0)
      trigger.current = button ?? null
      setPanel(panel === next ? null : next)
    }
    if (!user && next !== 'tools') { close(); void requireAuth(show) }
    else show()
  }
  const clearToken = () => {
    const cursor = mention.current?.start
    // Read the token before clearing it; React may execute state updaters later.
    const token = mention.current
    if (token) setText(removeMention(text, token))
    close()
    requestAnimationFrame(() => { ta.current?.focus(); if (cursor !== undefined) ta.current?.setSelectionRange(cursor, cursor) })
  }
  const choose = (index: number) => {
    if (panel === 'refs') {
      const row = selectableRefs[index]
      if (!row?.attachment) return
      addAttachments([row.attachment])
    } else if (panel === 'tools') {
      const tool = shownTools[index]
      if (!tool) return
      setSelectedTool(tool); setToolParams(defaultParams(tool))
    } else return
    clearToken()
  }
  const change = (value: string) => {
    setText(value)
    const token = mentionAt(value, ta.current?.selectionStart ?? value.length)
    mention.current = token
    trigger.current = null
    setPanel(token ? token.kind === '/' ? 'tools' : 'refs' : null)
    setQuery(token?.query ?? ''); setActive(0)
  }
  const missing = selectedTool ? missingToolFields(selectedTool, toolParams) : []
  const needsCanvas = Boolean(selectedTool?.overlay || selectedTool?.editor)
  const disabled = busy || sending || uploading || (!text.trim() && !attachments.length && !selectedTool)
  const send = async () => {
    if (disabled || sendLock.current) return
    sendLock.current = true; setSending(true)
    close()
    try {
      await requireAuth(async () => {
        if (selectedTool && !attachments.length) throw new Error('先用 @ 选择一张源图，或拖入图片')
        if (missing.length) throw new Error(`请补充：${missing.join('、')}`)
        // A guest has not fetched this private configuration yet; resolve it
        // after authentication before continuing the captured submission.
        const available = options ?? await ds.getComposerOptions()
        const normalized = normalizeGeneration(generation, available)
        if (!selectedTool && !available.models.some(item => item.id === normalized.modelId)) throw new Error('暂无可用模型，请稍后重试')
        const submitted = { ...normalized, count: mode === 'direct' ? Math.min(normalized.count, available.directMaxCount) : normalized.count }
        if (await onSend(text.trim(), mode, { generation: submitted, ...(selectedTool ? { tool: { id: selectedTool.id, params: toolParams } } : {}) }) !== false) {
          setText(value => value === text ? '' : value)
          setSelectedTool(value => value?.id === selectedTool?.id ? null : value)
        }
      })
    } catch (error) { toast(error instanceof Error ? error.message : '发送失败，请重试') }
    finally { sendLock.current = false; setSending(false) }
  }
  const upload = (files?: File[]) => requireAuth(async () => {
    if (uploadLock.current) return
    const fs = (files ?? await pickFiles()).filter(file => file.type.startsWith('image/'))
    if (!fs.length) { if (files?.length) toast('请选择图片文件'); return }
    const remaining = 10 - attachmentsRef.current.length
    if (!remaining) { toast('每条消息最多引用 10 张不同图片'); return }
    uploadLock.current = true; setUploading(true)
    try {
      const uploaded = await Promise.allSettled(fs.slice(0, remaining).map(async file => {
        if (ds.uploadChatAttachment) return ds.uploadChatAttachment(file)
        return mockFileAttachment(file)
      }))
      addAttachments(uploaded.flatMap(result => result.status === 'fulfilled' ? [result.value] : []))
      if (uploaded.some(result => result.status === 'rejected')) toast('部分图片上传失败，请重新选择这些图片')
    } finally { uploadLock.current = false; setUploading(false) }
  })
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || composition.current || event.nativeEvent.keyCode === 229) return
    if (panel === 'refs' || panel === 'tools') {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (rows.length) setActive((highlighted + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length); return
      }
      if (event.key === 'Enter') { event.preventDefault(); if (highlighted >= 0) choose(highlighted); return }
      if (event.key === 'Tab') { close(); return }
    }
    if (event.key === 'Escape' && panel) { event.preventDefault(); close(); return }
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
      if (panel === 'refs' || panel === 'tools') { if (highlighted >= 0) choose(highlighted) }
      else buttons[0]?.click()
    }
  }
  const control = (key: Panel, label: string, icon: string, value?: string) => <button type="button" className={'c' + (panel === key ? ' on' : '')} aria-label={label} aria-expanded={panel === key} aria-controls={panel === key ? `${id}-pop` : undefined} onClick={event => open(key, event.currentTarget)}><Icon name={icon} size={13} /><span>{value ?? label}</span><Icon name="chev" size={10} /></button>
  const modeDef = MODES.find(item => item.id === mode) ?? MODES[0]
  return (
    <Popover.Root open={panel !== null} onOpenChange={value => { if (!value) close() }} modal={false}>
      <Popover.Anchor asChild>
        <div ref={box} className={'cp2 cp-upgraded' + (drag ? ' drag' : '')}
          onDragOver={event => { if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes('application/x-v2-asset')) { event.preventDefault(); setDrag(true) } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrag(false) }}
          onDrop={event => {
            setDrag(false)
            const raw = event.dataTransfer.getData('application/x-v2-asset')
            if (raw) { event.preventDefault(); event.stopPropagation(); const attachment = readDroppedAttachment(raw); if (attachment) { close(); void requireAuth(() => addAttachments([attachment])) } else toast('无法识别这张引用图片'); return }
            if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void upload(Array.from(event.dataTransfer.files)) }
          }}>
          {selectedTool && <div className="cp-tool" aria-label={`${selectedTool.name}参数`}>
            <div className="cp-tool-h"><Icon name={selectedTool.icon} size={15} /><b>{selectedTool.name}</b><button type="button" aria-label="移除工具" onClick={() => setSelectedTool(null)}><Icon name="x" size={14} /></button></div>
            <p>{selectedTool.tip ?? '沿用画布工具的参数与执行方式。'}{needsCanvas ? ' 发送后在画布继续编辑。' : ''}</p>
            <div className="cp-tool-fields">{(selectedTool.fields ?? []).map(field => <ToolFieldControl key={field.id} f={field} value={toolParams[field.id]} onChange={value => setToolParams(previous => ({ ...previous, [field.id]: value }))}
              refChoices={references.flatMap(row => row.image ? [{ id: row.key, label: row.label, group: row.group === '画布上的图' ? '画布' as const : row.group === '品牌' ? '素材' as const : row.group, image: row.image }] : [])}
              onUploadReference={async () => {
                let image: ImageRef | undefined
                close()
                await requireAuth(async () => {
                  const [file] = await pickFiles()
                  if (!file) return
                  const material = await ds.uploadMaterial(file)
                  assets.reload(); image = material.image
                })
                return image
              }} />)}</div>
            <small>源图：{selectedTool.surfaces.includes('batch') && attachments.length ? `${attachments.length} 张引用图片` : attachments[0]?.label ?? '用 @ 选择，或拖入图片'}{!selectedTool.fields?.length ? ' · 此工具没有额外参数' : ''}</small>
          </div>}
          <div className="cp-editor">
            <div className="refs" aria-label="已选引用">{attachments.map(attachment => <span key={`${attachment.kind}:${attachment.id}`} title={attachment.label}>
              <img src={attachment.image.thumbUrl ?? attachment.image.url} alt="" />{attachment.label}
              <button type="button" aria-label={`移除引用 ${attachment.label}`} onClick={() => onAttachmentsChange(attachments.filter(item => item.image.id !== attachment.image.id))}><Icon name="x" size={11} /></button>
            </span>)}</div>
            <textarea ref={ta} aria-label="描述需求" aria-expanded={panel === 'refs' || panel === 'tools'} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls={panel === 'refs' || panel === 'tools' ? `${id}-list` : undefined} aria-activedescendant={highlighted >= 0 && (panel === 'refs' || panel === 'tools') ? `${id}-row-${highlighted}` : undefined}
              value={text} rows={2} placeholder={placeholder ?? '描述要创作的画面，@ 引用图片，/ 选择工具'} maxLength={3600}
              onChange={event => change(event.target.value)} onKeyDown={keyDown} onClick={() => { if (mention.current) change(text) }}
              onCompositionStart={() => { composition.current = true }} onCompositionEnd={() => { composition.current = false }}
              onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.some(file => file.type.startsWith('image/'))) { event.preventDefault(); void upload(files) } }} />
          </div>
          <div className="cp-shortcuts"><button type="button" aria-label="引用图片" onClick={event => open('refs', event.currentTarget)}>@ <span>引用</span></button><button type="button" aria-label="选择工具" onClick={event => open('tools', event.currentTarget)}>/ <span>工具</span></button><span>{uploading ? '图片上传中…' : `${attachments.length}/10 引用 · 支持粘贴或拖图`}</span></div>
          <div className="ctl cp-params" aria-label="生成参数">
            {control('add', '添加图片', 'plus', '')}
            {control('mode', '模式', modeDef.icon, modeDef.name)}
            {control('model', '模型', 'sparkles', model?.name ?? (optionsLoad.loading ? '加载模型' : '暂无模型'))}
            {control('format', '比例与分辨率', 'ratio', `${current.ratio} · ${current.resolution.toUpperCase()}`)}
            {control('count', '张数', 'layers', `${count} 张`)}
            <span className="sp" />
            {onStop ? <button type="button" className="go" aria-label={stopping ? '正在停止' : '停止生成'} disabled={stopping} onClick={onStop}><Icon name="x" size={14} /></button> : <button type="button" className="go" aria-label={sending ? '正在发送' : '发送'} disabled={disabled} onClick={() => void send()}><Icon name="send" size={14} /></button>}
          </div>
          {selectedTool && <p className="cp-note">工具使用上方专属参数；通用胶囊用于下一次对话创作。</p>}
          {optionsLoad.error && <p className="cp-note" role="status">模型加载失败 <button type="button" onClick={optionsLoad.reload}>重试</button></p>}
        </div>
      </Popover.Anchor>
      <Popover.Portal container={box.current?.closest('.v2') ?? undefined}>
        <Popover.Content ref={pop} id={`${id}-pop`} aria-label={panel === 'refs' ? '引用图片' : panel === 'tools' ? '选择工具' : panel === 'add' ? '添加图片' : '生成参数'} className="composer-pop" side="top" align="start" sideOffset={8} collisionPadding={12}
          onOpenAutoFocus={event => { if (mention.current) event.preventDefault() }}
          onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else ta.current?.focus() }}
          onInteractOutside={event => { if (box.current?.contains(event.target as Node)) event.preventDefault() }} onKeyDown={popupKeys}>
          {(panel === 'refs' || panel === 'tools') ? <>
            <div className="cp-pop-h"><b>{panel === 'refs' ? '引用图片' : '选择工具'}</b><small>↑↓ 选择 · Enter 确认</small></div>
            <div className="cp-search"><Icon name="search" size={14} /><input aria-label={panel === 'refs' ? '搜索引用' : '搜索工具'} placeholder={panel === 'refs' ? '搜索画布、商品、模特…' : '搜索工具名称'} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} /></div>
            <div className="cp-options" id={`${id}-list`} role="listbox" aria-label={panel === 'refs' ? '引用列表' : '工具列表'}>
              {panel === 'refs' ? REFERENCE_GROUPS.map(group => <div key={group} role="group" aria-label={group}><div className="cp-group">{group}<small>{shownRefs.filter(row => row.group === group).length}</small></div>
                {shownRefs.filter(row => row.group === group).map(row => { const index = selectableRefs.indexOf(row); const chosen = attachments.some(att => att.image.id === row.image?.id); return <button type="button" role="option" aria-selected={chosen || index === highlighted} disabled={!row.attachment || chosen} data-cp-option data-row={index} id={index >= 0 ? `${id}-row-${index}` : undefined} key={row.key} className={'cp-option' + (index >= 0 && index === highlighted ? ' hv' : '')} onFocus={() => { if (index >= 0) setActive(index) }} onMouseEnter={() => { if (index >= 0) setActive(index) }} onClick={() => choose(index)}>
                  {row.image ? <img src={row.image.thumbUrl ?? row.image.url} alt="" /> : <Icon name="img" size={20} />}<span>{row.label}<small>{chosen ? '已引用' : !row.attachment ? '还没有参考图片' : group}</small></span>{chosen && <Icon name="check" size={12} />}
                </button> })}
                {!shownRefs.some(row => row.group === group) && <p className="cp-empty">{assets.loading && group !== '画布上的图' ? '加载中…' : q ? '没有匹配的图片' : group === '画布上的图' ? '画布图片会出现在这里' : `暂无${group}图片`}</p>}
              </div>) : <>{shownTools.map((tool, index) => <button type="button" role="option" aria-selected={index === highlighted} data-cp-option data-row={index} id={`${id}-row-${index}`} key={tool.id} className={'cp-option' + (index === highlighted ? ' hv' : '')} onFocus={() => setActive(index)} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}><Icon name={tool.icon} size={19} /><span>{tool.name}<small>{tool.tip ?? '选择后填写参数，再发送'}</small></span><Icon name="right" size={12} /></button>)}{!shownTools.length && <p className="cp-empty">{toolsLoading ? '加载工具中…' : toolError ? '工具加载失败' : '没有匹配的工具'}</p>}</>}
            </div>
            {panel === 'refs' && !user && <button type="button" className="cp-retry" onClick={() => { close(); void requireAuth(() => setPanel('refs')) }}>登录后引用你的商品、模特、品牌和素材</button>}
            {panel === 'refs' && assets.data?.failed && <button type="button" className="cp-retry" onClick={assets.reload}>部分资产加载失败，点击重试</button>}
            {panel === 'tools' && toolError && <button type="button" className="cp-retry" onClick={reloadTools}>工具加载失败，点击重试</button>}
          </> : panel === 'add' ? <><div className="cp-pop-h"><b>添加图片</b></div><button type="button" data-cp-option className="cp-option" onClick={() => { close(); void upload() }}><Icon name="upload" /><span>上传图片<small>也可以粘贴或拖入图片</small></span></button><button type="button" data-cp-option className="cp-option" onClick={() => { setPanel('refs'); setQuery('') }}><Icon name="asset" /><span>从画布或资产引用</span></button></> : panel ? <ComposerParameters key={panel} panel={panel} options={options} generation={selection} mode={mode} onGenerationChange={setGeneration} onModeChange={setMode} onClose={close} /> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

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
