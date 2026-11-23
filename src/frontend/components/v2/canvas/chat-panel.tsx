'use client'
import { publicAgentText } from '@/lib/agent/public-progress'
import { chatErrorAction, chatErrorLabels } from '@/lib/v2/chat-error'
import { AccountMenu } from '../account-menu'
import { imageDimensions, generationSpecSummary } from '@/lib/v2/image-metadata'
import { Link } from '@/lib/navigation'
import React, { useEffect, useCallback, useRef, useState, type CSSProperties } from 'react'
import type { AgentMode, AskMessage, AssistantMessage, ChatAttachment, ChatMessage, ImageRef, Project } from '@/lib/v2/types'
import type { AgentContentBlock, AgentQueueState, AgentQuotaPauseState, ToolEventPayload } from '@/lib/v2/agent-stream-handler'
import type { ComposerPromptQuote } from '@/lib/v2/structured-input'
import type { ComposerPrefill } from '@/lib/v2/regenerate-draft'
import { Composer, type ComposerSubmission } from '../composer'
import { BrandMark, Icon } from '../icons'
import { useDismiss, useToast } from '../ui'
import { AskCard } from './ask-card'
import { Lightbox } from '../lazy-overlays'
import { PlanCard } from './plan-card'
import { ProjectActionDialog, ProjectHistory } from '../project-history'
import { ProcessingFeedback } from '../processing-feedback'
import { GenerationFx, GenerationSource, GenerationBatchStep, genDelay, useChatResultOutput } from './generation-state'

export type SessionView = 'chat' | 'split'

export interface ChatPanelProps {
  onRetryOutput?: (target: import('@/lib/agent/retry').AgentRetryTarget) => Promise<void>
  onRetryVideo?: (id: string) => Promise<void>
  onReviewPlan?: (command: import('@/lib/agent-pi/image-plan').PiImagePlanCommand) => Promise<void>
  lifecycle?: import('@/lib/v2/agent-chat-contract').AgentChatLifecycle
  connection?: import('@/lib/v2/agent-chat-contract').AgentChatConnection
  project: Project
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  onAttachmentLimitChange?: (limit: number) => void
  onSend: (text: string, mode: AgentMode, submission?: ComposerSubmission) => void | false | Promise<void | false>
  onAnswerAsk?: (ask: AskMessage, selectedKey: string, answerText: string, answers?: import('@/lib/agent/clarification').ClarificationAnswer[]) => void | false | Promise<void | false>
  onSkipAsk?: (ask: AskMessage) => void | Promise<void>
  canvasImages: { id: string; label: string; image: ImageRef }[]
  busy: boolean
  preparing?: boolean
  outputting?: boolean
  onStop?: () => void
  onSkipQueue?: (queue: AgentQueueState, threadId?: string) => void | Promise<void>
  onRestoreCashier?: (quota: AgentQuotaPauseState, threadId?: string) => void | Promise<void>
  onVerify?: () => void | Promise<void>
  stopping?: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
  onRename: (name: string) => void | Promise<void>
  onProjectRenamed?: (name: string) => void
  onProjectDeleted?: () => void
  onNewProject: () => void
  creatingProject?: boolean
  onFocusResult: (generationId: string, messageId?: string, silentMissing?: boolean) => boolean | void
  onOpenReferences?: (messageId?: string) => void
  view: SessionView
  collapsed: boolean
  onCollapseChange: (collapsed: boolean) => void
  onViewChange: (view: SessionView) => void
  selectedGenIds?: string[]
  avatar?: string
  prefill?: ComposerPrefill
}

const STEP_ICON = { think: 'hist', image: 'img', doc: 'doc', tool: 'wand' } as const

function parseRatioText(ratio?: string): { width: number; height: number } | undefined {
  if (!ratio) return undefined
  const m = ratio.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)
  if (!m) return undefined
  const w = Number(m[1]), h = Number(m[2])
  return w > 0 && h > 0 ? { width: w, height: h } : undefined
}

function ChatResultCard({
  result,
  roundStartedAt,
  index,
  spec,
  selected,
  isChatView,
  failure,
  onFocus,
  onRetry,
  onRetryVideo,
}: {
  result: AssistantMessage['results'][number]
  roundStartedAt: string
  index: number
  spec?: string
  selected: boolean
  isChatView: boolean
  failure?: AssistantMessage['failure']
  onFocus: () => void
  onRetry?: ChatPanelProps['onRetryOutput']
  onRetryVideo?: ChatPanelProps['onRetryVideo']
}) {
  const [retrying, setRetrying] = useState(false)
  const adviceDialog = useRef<HTMLDialogElement>(null)
  const retryLock = useRef(false)
  const toast = useToast()
  const { output } = useChatResultOutput(result.id, result.itemId)
  const [playing, setPlaying] = useState(false)
  const sourceImage = output?.item.status === 'done' ? output.item.image : result.image
  const video = result.video ?? (output?.item.status === 'done' ? output.item.video : undefined)
  const size = (result.status === 'done' ? sourceImage : undefined) ?? output?.item.targetSize ?? result.targetSize ?? parseRatioText(result.ratio) ?? result.image ?? parseRatioText(spec) ?? { width: 3, height: 4 }
  const arW = Math.max(1, size.width)
  const arH = Math.max(1, size.height)
  const isWide = arW / arH >= 1.2
  const style = { '--i': index, aspectRatio: `${arW} / ${arH}` } as CSSProperties

  if (video && result.status === 'done') {
    const downloadUrl = video.url
    return (
      <div className={'rs-card rs-video-card' + (isWide ? ' wide' : '') + (selected ? ' sel' : '')} style={style}>
        {playing ? (
          <video className="rs-video nodrag" src={video.url} controls autoPlay playsInline
            onClick={(e) => e.stopPropagation()} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
        ) : (
          <>
            <img src={sourceImage?.thumbUrl ?? sourceImage?.url} alt="" draggable={false} onClick={() => setPlaying(true)} />
            <button type="button" className="rs-play" aria-label="播放视频" title="播放视频" onClick={(e) => { e.stopPropagation(); setPlaying(true) }}>
              <Icon name="play" size={22} />
            </button>
            <span className="rs-video-dimensions tnum">{Math.round(video.duration)} 秒</span>
            <a className="rs-video-dl" href={downloadUrl} download title="下载视频" aria-label="下载视频"
              onClick={(e) => e.stopPropagation()}>
              <Icon name="dl" size={13} />
            </a>
          </>
        )}
        <span className="rs-ov" role="button" tabIndex={0} onClick={onFocus} onKeyDown={(e) => { if (e.key === 'Enter') onFocus() }}>
          <Icon name="canvas" size={11} />
          {isChatView ? '展开画布' : '定位画布'}
        </span>
      </div>
    )
  }

  if (sourceImage?.url && result.status === 'done') {
    return (
      <button
        type="button"
        className={'rs-card' + (isWide ? ' wide' : '') + (selected ? ' sel' : '')}
        style={style}
        onClick={onFocus}
        aria-label={`在画布中查看第 ${index + 1} 张生成图`}
        title={isChatView ? '点击展开画布并定位此图' : '在画布中定位'}
      >
        <img src={sourceImage.thumbUrl ?? sourceImage.url} alt="" draggable={false} />
        <span className="rs-dimensions tnum">{imageDimensions(sourceImage)}</span>
        <span className="rs-ov">
          <Icon name="canvas" size={11} />
          {isChatView ? '展开画布' : '定位画布'}
        </span>
      </button>
    )
  }

  if (result.status === 'failed') {
    const target = output?.item.retryAllowed ? output.item.agentRetry : undefined
    const videoRetryId = output?.item.mediaType === 'video' && output.item.retryAllowed ? output.item.id : undefined
    return (
      <div className={'rs-skel rs-failed-card node failed' + (isWide ? ' wide' : '')} style={style} role="status">
        <span className="rs-failed-ico"><Icon name="alert" size={15} /></span>
        <span className="rs-failed-title">未完成</span>
        <span className="gen-unbilled">未扣费</span>
        <div className="rs-failed-actions">
          <button type="button" className="btn" onClick={() => adviceDialog.current?.showModal()}>查看处理建议</button>
          {target && onRetry && <button type="button" className="btn pri chat-retry" disabled={retrying} onClick={async () => {
            if (retryLock.current) return
            retryLock.current = true; setRetrying(true)
            try { await onRetry(target) }
            catch (error) { toast(error instanceof Error ? error.message : '重试状态待核实，请刷新查看') }
            finally { retryLock.current = false; setRetrying(false) }
          }}>{retrying ? '提交中' : '重试此张'}</button>}
          {videoRetryId && onRetryVideo && <button type="button" className="btn pri chat-retry" disabled={retrying} onClick={async () => {
            if (retryLock.current) return
            retryLock.current = true; setRetrying(true)
            try { await onRetryVideo(videoRetryId) }
            catch (error) { toast(error instanceof Error ? error.message : '视频重试提交失败，请稍后再试') }
            finally { retryLock.current = false; setRetrying(false) }
          }}>{retrying ? '提交中' : '重试视频'}</button>}
        </div>
        <dialog className="nav-dialog" ref={adviceDialog} aria-label="处理建议">
          <h2>第 {index + 1} 张图的处理建议</h2>
          {output?.item.errorMessage && <p>{publicAgentText(output.item.errorMessage)}</p>}
          <p>{failure ? chatErrorAction(failure) : target || videoRetryId ? '可以点击「重试此张」，重新生成这个位置的图片。' : '请先查看这次生成的最新进度。如果仍未收到图片，请联系管理员核对该项目。'}</p>
          <form method="dialog"><footer><button className="btn pri">关闭</button></footer></form>
        </dialog>
      </div>
    )
  }

  const phase = output?.item.generationPhase ?? result.generationPhase ?? 'queued'
  const stageLabel =
    phase === 'queued'
      ? '排队中'
      : phase === 'processing'
        ? '核实中'
        : phase === 'unconfirmed'
          ? '确认中'
          : '生成中'

  return (
    <div
      className={'rs-skel node gen' + (isWide ? ' wide' : '') + ` phase-${phase}` + (output?.item.placeholder?.url ? ' gen-e' : '')}
      style={{ ...style, '--delay': genDelay(result.itemId ?? result.id) } as CSSProperties}
      role="group"
      aria-label={`第 ${index + 1} 张 ${stageLabel}`}
    >
      <GenerationSource image={output?.item.placeholder} />
      <GenerationFx id={result.itemId ?? result.id} paused={phase === 'unconfirmed'} />
      <span className="gen-pill"><span role="status">{stageLabel}</span>
        {phase !== 'unconfirmed' && (!output || output.item.status === 'running') && <ProcessingFeedback
          startedAt={output?.item.startedAt} roundStartedAt={roundStartedAt} estimatedDurationMs={output?.item.estimatedDurationMs} phase={phase}
          kind={output?.item.mediaType === 'video' ? 'video' : 'image'} />}
      </span>
    </div>
  )
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** 快照回退时，新到达回复保留模拟；真实 SSE 和历史消息不重播。 */
const LIVE_WINDOW_MS = 90_000
function isLiveMessage(createdAt?: string) {
  const at = createdAt ? Date.parse(createdAt) : NaN
  return Number.isFinite(at) && Date.now() - at < LIVE_WINDOW_MS
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  let last = 0
  let k = 0
  for (;;) {
    const m = re.exec(text)
    if (!m) break
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) parts.push(<strong key={k++}>{token.slice(2, -2)}</strong>)
    else parts.push(<code key={k++}>{token.slice(1, -1)}</code>)
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}

function renderLines(lines: string[], cursor: React.ReactNode) {
  return lines.map((line, j) => (
    <React.Fragment key={j}>
      {j > 0 && <br />}
      {renderInline(line)}
      {j === lines.length - 1 ? cursor : null}
    </React.Fragment>
  ))
}

/** SSE 正文直接渲染累加文本；仅快照回退使用原有逐字显示。 */
function Body({ text, streaming, live, source }: { text: string; streaming?: boolean; live?: boolean; source?: AssistantMessage['textSource'] }) {
  const reducedMotion = useReducedMotion()
  const [visibleLen, setVisibleLen] = useState(() => ((streaming || live) && !reducedMotion ? 0 : text.length))

  useEffect(() => {
    if (source === 'sse' || reducedMotion) { setVisibleLen(text.length); return }
    if (visibleLen > text.length) { setVisibleLen(text.length); return }
    if (visibleLen === text.length) return
    const timer = window.setTimeout(() => {
      setVisibleLen((prev) => Math.min(text.length, prev + Math.max(2, Math.ceil((text.length - prev) / 80))))
    }, 24)
    return () => window.clearTimeout(timer)
  }, [text, reducedMotion, visibleLen, source])

  const shown = source === 'sse' || reducedMotion ? text : text.slice(0, visibleLen)
  const showCursor = !reducedMotion && (Boolean(streaming) || source !== 'sse' && visibleLen < text.length)

  if (!shown && showCursor) {
    return (
      <p style={{ color: 'var(--tx)' }}>
        <span className="stream-cursor" aria-hidden />
      </p>
    )
  }

  const blocks = shown.split(/\n{2,}/)
  const isUl = (l: string) => /^[-*]\s+/.test(l)
  const isOl = (l: string) => /^\d+\.\s+/.test(l)
  return (
    <div className="ab-body-wrap">
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1
        const cursor = isLast && showCursor ? <span className="stream-cursor" aria-hidden /> : null
        const lines = b.split('\n')
        if (lines.every(isUl)) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  {renderInline(l.replace(/^[-*]\s+/, ''))}
                  {j === lines.length - 1 ? cursor : null}
                </li>
              ))}
            </ul>
          )
        }
        if (lines.every(isOl)) {
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  {renderInline(l.replace(/^\d+\.\s+/, ''))}
                  {j === lines.length - 1 ? cursor : null}
                </li>
              ))}
            </ol>
          )
        }
        const [first, ...rest] = lines
        if (rest.length && rest.every(isUl)) {
          return (
            <div key={i}>
              <p>{renderInline(first)}</p>
              <ul>
                {rest.map((l, j) => (
                  <li key={j}>
                    {renderInline(l.replace(/^[-*]\s+/, ''))}
                    {j === rest.length - 1 ? cursor : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        if (rest.length && rest.every(isOl)) {
          return (
            <div key={i}>
              <p>{renderInline(first)}</p>
              <ol>
                {rest.map((l, j) => (
                  <li key={j}>
                    {renderInline(l.replace(/^\d+\.\s+/, ''))}
                    {j === rest.length - 1 ? cursor : null}
                  </li>
                ))}
              </ol>
            </div>
          )
        }
        if (/^所读技能[:：]\s*.+$/.test(b.trim())) {
          return cursor ? <p key={i}>{cursor}</p> : null
        }
        return (
          <p key={i} style={i === 0 ? { color: 'var(--tx)' } : undefined}>
            {renderLines(lines, cursor)}
          </p>
        )
      })}
    </div>
  )
}

const TOOL_EVENT_LABELS: Record<string, string> = {
  image_generation: '图像生成',
  video_generation: '视频生成',
  audio_generation: '音频生成',
  html_generation: '页面生成',
  code_generation: '代码生成',
  image_insight: '图像分析',
  image_verification: '出图质检',
  lora_recommendation: '风格推荐',
}

const NO_CONTENT_TOOLS = new Set([
  'x_load_skill',
  'load_skill',
  'use_skill',
  'x_inspect_image',
  'x_read',
  'intent_recognition',
])

const PARAM_LABELS: Record<string, string> = {
  prompt: '提示词',
  ratio: '比例',
  aspect_ratio: '比例',
  resolution: '清晰度',
  count: '张数',
  num_images: '张数',
  model: '模型',
  model_id: '模型',
  skill: '技能',
  skill_name: '技能',
  skillName: '技能',
  skill_id: '技能',
  style: '风格',
}

function isSkillLoadTool(name?: string): boolean {
  return Boolean(name && /^(x_load_skill|load_skill|use_skill|create_skill)$/i.test(name))
}

function extractSkillDisplayName(input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined
  for (const key of ['skillName', 'skill_name', 'name', 'title', 'skill', 'skill_id', 'skillId']) {
    const val = input[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return undefined
}

function summarizeToolParams(input?: Record<string, unknown>): Array<{ label: string; value: string }> {
  if (!input) return []
  const items: Array<{ label: string; value: string }> = []
  for (const [key, val] of Object.entries(input)) {
    if (val === undefined || val === null || val === '') continue
    const label = PARAM_LABELS[key] ?? key
    const text = typeof val === 'string' ? val : typeof val === 'number' || typeof val === 'boolean' ? String(val) : JSON.stringify(val)
    items.push({ label, value: text.length > 90 ? `${text.slice(0, 90)}…` : text })
    if (items.length >= 6) break
  }
  return items
}

type RenderableBlockGroup =
  | { kind: 'single'; block: AgentContentBlock }
  | { kind: 'tool_pair'; use: AgentContentBlock; result?: AgentContentBlock }

function groupStreamBlocks(blocks: AgentContentBlock[]): RenderableBlockGroup[] {
  const groups: RenderableBlockGroup[] = []
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i]
    if (cur.type === 'tool_use') {
      const next = blocks[i + 1]
      if (next && next.type === 'tool_result' && (!cur.id || !next.id || cur.id === next.id)) {
        groups.push({ kind: 'tool_pair', use: cur, result: next })
        i++
      } else {
        groups.push({ kind: 'tool_pair', use: cur })
      }
      continue
    }
    groups.push({ kind: 'single', block: cur })
  }
  return groups
}

function StreamContentBlocks({
  startedAt,
  blocks,
  streaming,
  expandedMap,
  messageId,
  onToggle,
}: {
  blocks: AgentContentBlock[]
  startedAt?: string
  streaming?: boolean
  expandedMap: Record<string, boolean>
  messageId: string
  onToggle: (key: string) => void
}) {
  const groups = groupStreamBlocks(blocks)
  return (
    <div className="ab-stream-blocks">
      {groups.map(group => {
        if (group.kind === 'tool_pair') {
          const { use: block, result } = group
          const key = `${messageId}:blk:${block.index}`
          const isRunning = block.status === 'streaming' || (Boolean(streaming) && !result && block.status !== 'error')
          const isError = Boolean(block.is_error || result?.is_error || block.status === 'error')
          const isSkill = isSkillLoadTool(block.name)
          const isNoContent = Boolean(block.name && NO_CONTENT_TOOLS.has(block.name))
          const skillName = isSkill ? extractSkillDisplayName(block.input) : undefined
          const paramPairs = summarizeToolParams(block.input)
          const resultRaw = result
            ? typeof result.content === 'string'
              ? result.content
              : result.content
                ? JSON.stringify(result.content, null, 2)
                : result.output !== undefined
                  ? JSON.stringify(result.output, null, 2)
                  : ''
            : ''
          const hasDetails = Boolean(paramPairs.length > 0 || block.partialJson || resultRaw)
          // 执行中自动展开（非 NO_CONTENT 工具），完成后自动收起，用户手动点击优先级最高
          const defaultOpen = !isNoContent && isRunning && hasDetails
          const open = key in expandedMap ? Boolean(expandedMap[key]) : defaultOpen
          const title = isSkill
            ? `${isRunning ? '加载技能中' : '已加载技能'}${skillName ? ` · ${skillName}` : ''}`
            : (block.name || 'tool')
          const inlineSummary = !open && !isSkill && paramPairs.length > 0
            ? paramPairs.slice(0, 2).map(p => `${p.label}: ${p.value}`).join(' · ')
            : undefined

          return (
            <div
              key={key}
              className={
                'ab-blk ab-blk-tool'
                + (isSkill ? ' ab-blk-skill' : '')
                + (isNoContent ? ' ab-blk-compact' : '')
                + (isRunning ? ' running' : ' done')
                + (isError ? ' error' : '')
              }
            >
              <button
                type="button"
                className="ab-blk-hd"
                aria-expanded={hasDetails ? open : undefined}
                disabled={!hasDetails}
                onClick={() => hasDetails && onToggle(key)}
              >
                <Icon name={isError ? 'alert' : isSkill ? 'doc' : 'wand'} size={13} />
                <span className="ab-blk-title">{title}</span>
                {inlineSummary && <span className="ab-blk-summary">{inlineSummary}</span>}
                {(isError || isRunning) && (
                  <span className="ab-blk-state">
                    {isError ? '失败' : block.partialJson && !paramPairs.length ? '组装参数中…' : '进行中'}
                  </span>
                )}
                {isRunning && <i className="pulse-dot" aria-hidden />}
                {hasDetails && <Icon name="chevR" size={12} className={'sl-caret' + (open ? ' open' : '')} />}
              </button>
              {streaming && isRunning && !result && !isError && !isSkill && <ProcessingFeedback kind="tool" roundStartedAt={startedAt} />}
              {open && hasDetails && (
                <div className="ab-blk-body">
                  {paramPairs.length > 0 ? (
                    <div className="ab-blk-params">
                      {paramPairs.map((pair, idx) => (
                        <div key={idx} className="ab-blk-param">
                          <span className="ab-blk-param-k">{pair.label}</span>
                          <span className="ab-blk-param-v">{pair.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : block.partialJson ? (
                    <pre className="ab-blk-code">{block.partialJson}</pre>
                  ) : null}
                  {resultRaw && (
                    <div className="ab-blk-res">
                      <div className="ab-blk-res-label">{result?.is_error ? '异常返回' : '返回结果'}</div>
                      <pre className="ab-blk-code">{resultRaw}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }

        const { block } = group
        const key = `${messageId}:blk:${block.index}`
        const open = Boolean(expandedMap[key])
        if (block.type === 'text') {
          if (!block.text) return null
          return <Body key={key} text={block.text} streaming={streaming && block.status === 'streaming'} source="sse" />
        }
        if (block.type === 'tool_result') {
          const raw = typeof block.content === 'string'
            ? block.content
            : block.content
              ? JSON.stringify(block.content, null, 2)
              : block.output !== undefined
                ? JSON.stringify(block.output, null, 2)
                : ''
          return (
            <div key={key} className={'ab-blk ab-blk-result' + (block.is_error ? ' error' : '')}>
              <button type="button" className="ab-blk-hd" aria-expanded={open} onClick={() => onToggle(key)}>
                <Icon name={block.is_error ? 'alert' : 'doc'} size={13} />
                <span className="ab-blk-title">{block.is_error ? '工具返回异常' : '工具返回结果'}</span>
                {raw && <Icon name="chevR" size={12} className={'sl-caret' + (open ? ' open' : '')} />}
              </button>
              {open && raw && <pre className="ab-blk-code">{raw}</pre>}
            </div>
          )
        }
        if (block.type === 'tool_event') {
          const ev = (block.content && typeof block.content === 'object' ? block.content : {}) as ToolEventPayload
          const evType = ev.event_type ?? ev.type ?? 'tool_event'
          const label = ev.title || TOOL_EVENT_LABELS[evType] || evType
          const isRunning = ev.status === 'running' || ev.status === 'queued' || block.status === 'streaming'
          return (
            <div key={key} className={'ab-blk ab-blk-event' + (isRunning ? ' running' : '')}>
              <div className="ab-blk-hd">
                <Icon name={evType.includes('image') || evType.includes('video') ? 'img' : 'wand'} size={13} />
                <span className="ab-blk-title">{label}</span>
                {ev.summary && <span className="ab-blk-summary">{ev.summary}</span>}
                {typeof ev.progress === 'number' && <span className="ab-blk-state tnum">{Math.round(ev.progress)}%</span>}
                {isRunning && <i className="pulse-dot" aria-hidden />}
              </div>
            </div>
          )
        }
        if (block.type === 'image' && block.image_url) {
          return (
            <div key={key} className="ab-blk ab-blk-image">
              <img src={block.image_url} alt="" draggable={false} />
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

/** 对齐 Lovart（4971.js:19705-19733）：用户消息超过 5 行（~112px）自动折叠，点击展开/收起。 */
function CollapsibleUserText({ className, children, textLength }: { className: string; children: React.ReactNode; textLength: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(() => textLength > 180)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      if (el.scrollHeight > 0) setOverflows(el.scrollHeight > 114)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [textLength])

  const collapsed = overflows && !expanded
  return (
    <div className={'ub-clamp-wrap' + (collapsed ? ' is-clamped' : '')}>
      <div ref={ref} className={className + (collapsed ? ' ub-clamped' : '')}>
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="ub-expand-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded(prev => !prev)}
        >
          <span>{expanded ? '收起' : '展开全文'}</span>
          <Icon name="chev" size={11} className={expanded ? 'ub-expand-up' : undefined} />
        </button>
      )}
    </div>
  )
}

export const ChatPanel = React.memo(function ChatPanel(p: ChatPanelProps) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [editPrefill, setEditPrefill] = useState<ComposerPrefill>()
  const clearPromptQuote = useCallback(() => setPromptQuote(null), [])
  const [promptQuote, setPromptQuote] = useState<ComposerPromptQuote | null>(null)
  const [queueSkipping, setQueueSkipping] = useState(false)
  const [cashierRestoring, setCashierRestoring] = useState(false)
  const [votes, setVotes] = useState<Record<string, 'up' | 'down'>>({})
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [showScrollLatest, setShowScrollLatest] = useState(false)
  const [draft, setDraft] = useState<{ text: string; seq: number } | null>(null)
  useEffect(() => { setEditPrefill(undefined) }, [p.prefill])
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottomRef = useRef(true)
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef)

  const scrollToBottom = () => {
    const el = listRef.current
    if (!el) return
    stickBottomRef.current = true
    setShowScrollLatest(false)
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  }

  const syncScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (stickBottomRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
    stickBottomRef.current = atBottom
    setShowScrollLatest(!atBottom)
  }, [])
  useEffect(syncScroll, [syncScroll, p.messages, p.busy, p.view, p.collapsed])
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncScroll)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [syncScroll, p.project.id])

  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 48
    stickBottomRef.current = atBottom
    setShowScrollLatest(!atBottom)
  }

  const activeAsk = [...p.messages].reverse().find(
    (m): m is AskMessage => m.role === 'ask' && !m.answered && !m.skipped
  )

  const [referencePreview, setReferencePreview] = useState<ChatAttachment | null>(null)
  const openReference = (attachment: ChatAttachment, messageId: string) => {
    if (p.view === 'chat') {
      setReferencePreview(attachment)
      return
    }
    const found = p.onFocusResult(attachment.kind === 'canvas' ? attachment.id : attachment.image.id, messageId, true)
    if (found === false) setReferencePreview(attachment)
  }
  const isChatView = p.view === 'chat'
  const isCollapsed = p.view === 'split' && p.collapsed

  return (
    <aside
      className={'fp view-' + p.view + (isCollapsed ? ' collapsed' : '')}
      aria-label="对话"
      aria-hidden={isCollapsed || undefined}
    >
      {referencePreview && <Lightbox items={[{ id: referencePreview.id, title: referencePreview.label, image: referencePreview.image }]}
        index={0} onIndexChange={() => {}} onClose={() => setReferencePreview(null)} />}
      <div className="fh" ref={menuRef}>
        <Link prefetch={false} href="/v2" className="lg" title="回到首页" aria-label="回到首页"><BrandMark size={15} /></Link>
        <button className="pj" onClick={() => setMenuOpen((o) => !o)} title={p.project.name} aria-expanded={menuOpen}>
          <span key={p.project.name} className="pj-txt pj-txt-in">{p.project.name}</span>
          <span className="pj-caret">▾</span>
        </button>
        <div className="ib">
          <ProjectHistory currentId={p.project.id} onCurrentDeleted={p.onProjectDeleted} onRenamed={(id, name) => { if (id === p.project.id) p.onProjectRenamed?.(name) }} />
          {isChatView ? (
            <>
              <AccountMenu compact />
              <button className="ibtn" title="新建项目" aria-label="新建项目" disabled={p.creatingProject} onClick={p.onNewProject}>
                <Icon name="plus" size={16} />
              </button>
              <button
                className="ibtn"
                title="切换到分栏画布"
                aria-label="切换到分栏画布"
                onClick={() => p.onViewChange('split')}
              >
                <Icon name="sidebar" size={16} />
              </button>
            </>
          ) : (
            <>
              <button className="ibtn" title="新建项目" aria-label="新建项目" disabled={p.creatingProject} onClick={p.onNewProject}>
                <Icon name="plus" size={16} />
              </button>
              <button
                className="ibtn"
                title="放大成全屏对话"
                aria-label="放大成全屏对话"
                data-testid="fullscreen-chat-btn"
                onClick={() => p.onViewChange('chat')}
              >
                <Icon name="expand" size={15} />
              </button>
              <button
                className="ibtn"
                title="收起对话栏"
                aria-label="收起对话栏"
                data-testid="collapse-chat-btn"
                onClick={() => p.onCollapseChange(true)}
              >
                <Icon name="sidebar-close" size={16} />
              </button>
            </>
          )}
        </div>
        {menuOpen && (
          <div className="menu pmenu" style={{ position: 'absolute' }}>
            <Link className="mi" prefetch={false} href="/v2/projects"><Icon name="canvas" />所有项目</Link>
            <button className="mi" disabled={p.creatingProject} onClick={() => { setMenuOpen(false); p.onNewProject() }}><Icon name="plus" />新建项目</button>
            <button className="mi" onClick={() => { setMenuOpen(false); setRenaming(true) }}><Icon name="doc" />重命名</button>
            <div className="sep" />
            <Link className="mi" prefetch={false} href="/v2"><Icon name="home" />回到首页</Link>
            <Link className="mi" prefetch={false} href="/v2/assets"><Icon name="asset" />资产<small>商品 · 模特 · 品牌</small></Link>
            <Link className="mi" prefetch={false} href="/v2/assets?tab=history"><Icon name="hist" />生成记录</Link>
            <div className="sep" />
            <button className="mi" onClick={() => { setMenuOpen(false); toast('新手教程（占位）') }}><Icon name="info" />新手教程</button>
          </div>
        )}
      </div>
      {renaming && <ProjectActionDialog project={p.project} action="rename" onSubmit={async name => { await p.onRename(name) }} onClose={() => setRenaming(false)} />}

      <div className="ms" ref={listRef} onScroll={handleScroll}>
        <div className="ms-col">
          {p.messages.length === 0 && (
            <div className="chat-empty">
              <div>说说要给什么商品出什么图。</div>
              <div className="ce-sub">可以从资产里选商品、模特进来，或者直接把商品图片拖到这里。</div>
              <div className="ce-chips">
                <button className="ce-chip" onClick={() => p.onSend('出 4 张外景商品主图', 'agent')}><Icon name="create" size={11} />出 4 张外景主图</button>
                <button className="ce-chip" onClick={() => p.onSend('做一套 6 屏详情页', 'ecom-set')}><Icon name="doc" size={11} />6 屏详情页</button>
                {!isChatView && (
                  <button className="ce-chip" onClick={p.onToggleDrawer}><Icon name="asset" size={11} />打开资产抽屉</button>
                )}
              </div>
            </div>
          )}
          {p.messages.map((m) => {
            if (m.role === 'user') {
              const actions = (<div className="nav-message-actions">
                    <button type="button" aria-label="重新编辑" title="重新编辑" onClick={() => {
                      p.onAttachmentsChange(m.attachments.map(attachment => ({ ...attachment, image: { ...attachment.image } })))
                      setDraft(null)
                      setEditPrefill({ id: `${m.id}:${Date.now()}`, text: m.text, mode: m.mode, generation: m.generation })
                      toast('原文与附件已回填，发送后创建新一轮')
                    }}><Icon name="edit" size={13} /><span>重新编辑</span></button>
                    <button type="button" aria-label="复制消息" title="复制" onClick={async () => {
                      try { await navigator.clipboard.writeText(m.text); toast('已复制') }
                      catch { toast('复制失败，请检查剪贴板权限') }
                    }}><Icon name="copy" size={13} /><span>复制</span></button>
                  </div>)
              const qas = parseAskAnswers(m.text)
              if (qas.length > 0) {
                return (
                  <div key={m.id} className={'ub ub-answer' + (qas.length > 1 ? ' multi' : '')}>
                    {qas.map((x, i) => (
                      <div key={i} className="ub-qa-row">
                        <span className="ub-q" title={x.question}><b>Q:</b> {x.question}？</span>
                        <span className="ub-a"><b>A:</b> {x.answer}</span>
                      </div>
                    ))}
                    {actions}
                  </div>
                )
              }
              if (m.contents && m.contents.length > 0) {
                const quoteBlock = m.contents.find(b => b.type === 'prompt_quote')
                const inlineBlocks = m.contents.filter(b => b.type !== 'prompt_quote' && b.type !== 'preference_scale')
                return (
                  <div key={m.id} className="ub ub-structured">
                    {quoteBlock && quoteBlock.type === 'prompt_quote' && (
                      <div className="ub-quote-bar">
                        <span>引用</span>
                        <span>{quoteBlock.quote_text}</span>
                      </div>
                    )}
                    <CollapsibleUserText className="ub-txt ub-inline-flow" textLength={m.text.length}>
                      {inlineBlocks.map((blk, idx) => {
                        if (blk.type === 'text') {
                          return <React.Fragment key={idx}>{idx > 0 ? ' ' : ''}{blk.text}</React.Fragment>
                        }
                        if (blk.type === 'skill') {
                          return (
                            <span key={idx} className="ub-inline-chip ub-inline-skill" title={`技能：${blk.skillName}`}>
                              <Icon name="doc" size={12} />
                              <span>{blk.skillName}</span>
                            </span>
                          )
                        }
                        if (blk.type === 'kit') {
                          return (
                            <span key={idx} className="ub-inline-chip ub-inline-kit" title={`品牌套件：${blk.kitName ?? blk.kitId}`}>
                              <Icon name="sparkles" size={12} />
                              <span>{blk.kitName ?? blk.kitId}</span>
                            </span>
                          )
                        }
                        if (blk.type === 'ref_context_item' || blk.type === 'image') {
                          const att = m.attachments.find(a =>
                            blk.type === 'ref_context_item'
                              ? a.id === blk.nodeId || a.image.id === blk.assetId
                              : a.image.id === blk.assetId
                          )
                          const thumb = att?.image.thumbUrl ?? att?.image.url ?? blk.imageUrl
                          const label = blk.label ?? att?.label ?? '参考图'
                          const hasMask = Boolean(blk.maskUrl || blk.maskAssetId || att?.mask)
                          return (
                            <button
                              key={idx}
                              type="button"
                              className={'ub-inline-chip ub-inline-img' + (hasMask ? ' has-mask' : '')}
                              aria-label={`引用 ${label}`}
                              title={att ? `${label} · ${imageDimensions(att.image)}` : label}
                              onClick={() => att && openReference(att, m.id)}
                            >
                              {thumb && <img src={thumb} alt="" />}
                              <span>{label}</span>
                              {hasMask && <em>遮罩</em>}
                            </button>
                          )
                        }
                        return null
                      })}
                    </CollapsibleUserText>
                    {actions}
                  </div>
                )
              }
              const visibleAttachments = m.attachments.filter(a => a.kind !== 'canvas' || !m.text.includes('@' + a.label))
              return (
                <div key={m.id} className="ub">
                  {visibleAttachments.length > 0 && (
                    <div className="at">
                      {visibleAttachments.map((a) => (
                        <button type="button" className="message-ref" key={`${a.kind}:${a.id}`} aria-label={`引用 ${a.label}`} title={`${a.label} · ${imageDimensions(a.image)}`}
                          onClick={() => openReference(a, m.id)}>
                          <img src={a.image.thumbUrl ?? a.image.url} alt="" />
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <CollapsibleUserText className="ub-txt" textLength={m.text.length}>
                    {renderRefs(m.text, m.attachments, (attachment) => openReference(attachment, m.id))}
                  </CollapsibleUserText>
                  {actions}
                </div>
              )
            }
            if (m.role === 'ask') {
              return (
                <div key={m.id} className="ab ask-msg">
                  {m.reason && <p>{m.reason}</p>}
                  {m.skipped && <div className="sl done"><Icon name="hist" size={13} /><span className="sl-txt">{m.clarification?.state === 'expired' ? '问题已过期' : '已跳过，本轮不会生成'}</span></div>}
                </div>
              )
            }
            const hasBatchStep = m.steps.some(step => Boolean(step.itemId))
            const stepNodes = m.steps.map((s, i) => {
              if (s.itemId) {
                if (i > 0 && m.steps[i - 1].itemId) return null
                const run: string[] = []
                for (let j = i; j < m.steps.length && m.steps[j].itemId; j += 1) run.push(m.steps[j].itemId!)
                return (
                  <div key={s.itemId} className="sl-wrap" style={{ '--step-i': i } as CSSProperties}>
                    <GenerationBatchStep itemIds={run} label={s.label} />
                  </div>
                )
              }
              if (hasBatchStep && i === m.steps.length - 1 && (s.label === '已完成' || s.label === '图片未能交付' || /^已交付\s*\d+\s*张/.test(s.label))) {
                return null
              }
              const active = s.status === 'running' || (s.status !== 'done' && s.status !== 'failed' && (s.label.includes('中') || Boolean(s.progress && s.progress.done < s.progress.total)))
              const done = !active && s.status !== 'failed'
              const failed = s.status === 'failed'
              const stepLabel = publicAgentText(s.label)
              const opensRefPanel = Boolean(p.onOpenReferences && !active && !failed && /参考(素材|图)?分析|已分析参考图/.test(stepLabel))
              const canExpand = !opensRefPanel && Boolean(s.collapsible || s.detail)
              const clickable = opensRefPanel || canExpand
              const stepKey = `${m.id}:${i}`
              const expanded = expandedSteps[stepKey] ?? (s.icon === 'think' && Boolean(s.detail))
              const handleStepClick = () => {
                if (opensRefPanel) {
                  p.onOpenReferences?.(m.id)
                  return
                }
                if (canExpand) setExpandedSteps(prev => ({ ...prev, [stepKey]: !expanded }))
              }
              return (
                <div key={i} className="sl-wrap" style={{ '--step-i': i } as CSSProperties}>
                  <div
                    className={'sl' + (active ? ' active' : '') + (done ? ' done' : '') + (failed ? ' failed' : '') + (canExpand ? ' collapsible' : '') + (opensRefPanel ? ' collapsible ref-link' : '')}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-expanded={canExpand ? expanded : undefined}
                    title={opensRefPanel ? '查看参考素材面板' : undefined}
                    onClick={clickable ? handleStepClick : undefined}
                    onKeyDown={clickable ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleStepClick()
                      }
                    } : undefined}
                  >
                    <Icon name={failed ? 'alert' : STEP_ICON[s.icon]} size={13} />
                    <span className="sl-txt">{stepLabel}{s.progress && ` · 生成中 ${s.progress.done} / ${s.progress.total}`}</span>
                    {clickable && <Icon name="chevR" size={12} className={'sl-caret' + (canExpand && expanded ? ' open' : '')} />}
                    {active && <i className="pulse-dot" aria-hidden />}
                  </div>
                  {opensRefPanel && s.detail && (
                    <button type="button" className="sl-analysis-toggle" aria-expanded={expanded}
                      onClick={() => setExpandedSteps(prev => ({ ...prev, [stepKey]: !expanded }))}>
                      分析摘要
                    </button>
                  )}
                  {(canExpand || opensRefPanel) && expanded && s.detail && (
                    <div className="sl-detail">{publicAgentText(s.detail)}</div>
                  )}
                </div>
              )
            }).filter(Boolean)
            const hasStreamBlocks = Boolean(m.blocks && m.blocks.length > 0)
            const hasStreamTextBlock = Boolean(m.blocks?.some(block => block.type === 'text' && Boolean(block.text)))
            const showBody = Boolean(!hasStreamTextBlock && m.body && !(m.failure?.code.toLowerCase() === 'unclassified_error' && /unclassified_error|受理状态未知/i.test(m.body)))
            const bodyBeforePlan = Boolean(m.imagePlan && m.results.length === 0)
            return (
              <div key={m.id} className={'ab' + (m.textSource !== 'sse' && !m.steps.some(step => step.streamStepId) && isLiveMessage(m.createdAt) ? ' live' : '')}>
                {stepNodes.length > 0 && <div className="ab-steps">{stepNodes}</div>}
                {hasStreamBlocks && (
                  <StreamContentBlocks
                    blocks={m.blocks!}
                    startedAt={m.createdAt}
                    streaming={m.streaming}
                    expandedMap={expandedSteps}
                    messageId={m.id}
                    onToggle={key => setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }))}
                  />
                )}
                {m.queueState?.queued && (
                  <div className="ab-inline-banner ab-queue-banner" role="status">
                    <span>{m.queueState.position ? `任务排队中（第 ${m.queueState.position} 位）` : '任务排队中…'}</span>
                    {p.onSkipQueue && (
                      <button
                        type="button"
                        className="ab-chip"
                        disabled={queueSkipping}
                        onClick={async () => {
                          setQueueSkipping(true)
                          try { await p.onSkipQueue?.(m.queueState!, m.threadId); toast('已请求优先执行') }
                          catch (error) { toast(error instanceof Error ? error.message : '跳过排队失败') }
                          finally { setQueueSkipping(false) }
                        }}
                      >
                        {queueSkipping ? '处理中…' : '跳过排队'}
                      </button>
                    )}
                  </div>
                )}
                {m.quotaPause?.paused && (
                  <div className="ab-inline-banner ab-quota-banner" role="status">
                    <span>{m.quotaPause.reason || '配额不足，已暂停当前会话'}</span>
                    <div className="ab-inline-banner-actions">
                      <Link className="ab-chip" href="/account">前往充值</Link>
                      {p.onRestoreCashier && (
                        <button
                          type="button"
                          className="ab-chip pri"
                          disabled={cashierRestoring}
                          onClick={async () => {
                            setCashierRestoring(true)
                            try { await p.onRestoreCashier?.(m.quotaPause!, m.threadId); toast('已恢复执行') }
                            catch (error) { toast(error instanceof Error ? error.message : '恢复执行失败') }
                            finally { setCashierRestoring(false) }
                          }}
                        >
                          {cashierRestoring ? '恢复中…' : '已充值，继续执行'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {m.results.length > 0 && (
                  <div className="rs">
                    {m.results.map((r, idx) => (
                      <ChatResultCard
                        roundStartedAt={m.createdAt}
                        onRetry={p.onRetryOutput}
                        onRetryVideo={p.onRetryVideo}
                        key={r.id}
                        result={r}
                        failure={m.failure}
                        index={idx}
                        spec={m.meta?.spec}
                        selected={Boolean(p.selectedGenIds?.includes(r.id))}
                        isChatView={isChatView}
                        onFocus={() => p.onFocusResult(r.itemId ?? r.id, m.id)}
                      />
                    ))}
                  </div>
                )}
                {bodyBeforePlan && showBody && <Body text={m.body!} streaming={m.streaming} source={m.textSource} live={isLiveMessage(m.createdAt)} />}
                {m.imagePlan && <PlanCard key={`${m.imagePlan.runId}:${m.imagePlan.revision}:${m.imagePlan.status}:${m.imagePlan.unavailableReferenceCount}`} plan={m.imagePlan} choices={p.canvasImages} onReview={p.onReviewPlan} />}
                {m.meta?.spec && <div className="ab-spec tnum">{m.results.some(result => result.status === 'done' && result.image) ? generationSpecSummary(m.meta.spec) : m.meta.spec}</div>}
                {!bodyBeforePlan && showBody && <Body text={m.body!} streaming={m.streaming} source={m.textSource} live={isLiveMessage(m.createdAt)} />}
                {m.failure && <div className="ab-error" role="status" data-error-category={m.failure.category} data-retryable={m.failure.retryable}>
                  <strong>{chatErrorLabels[m.failure.category]}</strong>
                  <p>{chatErrorAction(m.failure)}</p>
                  <details className="ab-error-code"><summary>技术详情</summary>错误码：{m.failure.code}</details>
                  <div className="ab-error-actions">
                    {m.failure.category === 'invalid_input' && <button type="button" className="ab-chip" onClick={() => {
                      const index = p.messages.findIndex(message => message.id === m.id)
                      const previous = p.messages.slice(0, index).findLast(message => message.role === 'user')
                      if (previous?.role === 'user') setDraft({ text: previous.text, seq: Date.now() })
                    }}>修改输入</button>}
                    {m.failure.category === 'auth' && <Link className="ab-chip" href="/v2">重新登录</Link>}
                    {p.onVerify && ['unknown', 'accepted'].includes(m.failure.receiptState) && <button type="button" className="ab-chip" onClick={() => { void p.onVerify?.() }}>核实原任务</button>}
                  </div>
                </div>}
                {!m.failure && m.retryable && <p role="status">允许重试：本轮尚未提交生成。</p>}
                {m.meta?.highlights && m.meta.highlights.length > 0 && (
                  <div className="ab-highlights">
                    <div className="ab-sec-t">这一版落实的几点</div>
                    <ul>
                      {m.meta.highlights.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {m.meta?.risks?.length ? <div className="ab-risks"><div className="ab-sec-t">请确认</div><ul>{m.meta.risks.map(risk => <li key={risk}>{risk}</li>)}</ul></div> : null}
                {m.meta?.suggestions && m.meta.suggestions.length > 0 && (
                  <div className="ab-suggestions">
                    <div className="ab-sec-t">常见调整方向</div>
                    <div className="ab-chips">
                      {m.meta.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="ab-chip"
                          onClick={() => setDraft({ text: s, seq: Date.now() })}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(m.body && !m.streaming) && (
                  <div className="ab-foot">
                    <div className="fb">
                      <button className={votes[m.id] === 'up' ? 'on' : ''} title="有用" aria-label="有用" aria-pressed={votes[m.id] === 'up'} onClick={() => setVotes((v) => ({ ...v, [m.id]: 'up' }))}><Icon name="up2" size={13} /></button>
                      <button className={votes[m.id] === 'down' ? 'on' : ''} title="没用" aria-label="没用" aria-pressed={votes[m.id] === 'down'} onClick={() => setVotes((v) => ({ ...v, [m.id]: 'down' }))}><Icon name="dn2" size={13} /></button>
                      <button title="引用此回复继续追问" aria-label="引用回复" onClick={() => { setPromptQuote({ text: (m.body ?? '').slice(0, 240), sourceMessageId: m.id }); toast('已引用到输入框') }}><Icon name="paste" size={13} /></button>
                      <button title="复制" aria-label="复制" onClick={() => { navigator.clipboard?.writeText(m.body ?? ''); toast('已复制') }}><Icon name="copy" size={13} /></button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!activeAsk && (
            <ChatStreamStatus
              messages={p.messages}
              busy={Boolean(p.busy || p.outputting)}
              connection={p.connection}
              stopping={p.stopping}
              onStop={p.onStop}
            />
          )}
        </div>
      </div>

      <div className="cp-col">
        {showScrollLatest && (
          <button type="button" className="scroll-latest-btn" onClick={scrollToBottom}>
            <Icon name="chev" size={13} />
            <span>回到最新</span>
          </button>
        )}
        {activeAsk && (
          <AskCard
            ask={activeAsk}
            disabled={p.busy}
            onSubmit={async (ask, selectedKey, answerText, answers) => {
              const accepted = p.onAnswerAsk
                ? await p.onAnswerAsk(ask, selectedKey, answerText, answers)
                : ask.clarification ? false : await p.onSend(answerText.startsWith('Q：') ? answerText : `Q：${ask.question} A：${answerText}`, 'agent')
              if (accepted !== false) setDraft(value => ({ text: '', seq: (value?.seq ?? 0) + 1 }))
            }}
            onSkip={(ask) => p.onSkipAsk?.(ask)}
          />
        )}
        <Composer
          key={p.project.id}
          projectId={p.project.id}
          canvas
          placeholder='请描述你的设计需求，"/" 使用技能，"@" 引用参考'
          initialMode={p.messages.filter(message => message.role === 'user').findLast(message => message.mode)?.mode}
          prefill={editPrefill ?? p.prefill}
          attachments={p.attachments}
          onAttachmentsChange={p.onAttachmentsChange}
          onAttachmentLimitChange={p.onAttachmentLimitChange}
          onSend={p.onSend}
          canvasImages={p.canvasImages}
          promptQuote={promptQuote}
          onClearPromptQuote={clearPromptQuote}
          busy={p.busy}
          preparing={p.preparing}
          draft={draft}
        />
      </div>
    </aside>
  )
})

function PendingBrainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5C6.35 2.5 5.1 3.55 5.02 5.05C3.92 5.32 3.25 6.3 3.25 7.45C3.25 8.48 3.82 9.35 4.7 9.72C4.65 10.02 4.62 10.32 4.62 10.6C4.62 12.15 5.82 13.5 7.5 13.5H8V2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 2.5C9.65 2.5 10.9 3.55 10.98 5.05C12.08 5.32 12.75 6.3 12.75 7.45C12.75 8.48 12.18 9.35 11.3 9.72C11.35 10.02 11.38 10.32 11.38 10.6C11.38 12.15 10.18 13.5 8.5 13.5H8V2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 复刻 Lovart 消息流状态（8842.js L27541–27592 & L28365–28370）：
 * 1. 首个回复块到达前：在最新用户消息正下方显示 `[脑图标] 输出中...`（扫光）。
 * 2. 回复块已出现且仍在执行非生图阶段时：消息流末尾显示三圆点呼吸加载与可选停止按钮。
 * 3. 生图阶段由画布和消息占位卡显示计时、预估用时与使用提示。
 */
function ChatStreamStatus({
  messages,
  busy,
  connection,
  stopping,
  onStop,
}: Pick<ChatPanelProps, 'connection' | 'stopping' | 'onStop'> & { messages: ChatMessage[]; busy: boolean }) {
  const reconnecting = connection === 'unavailable' || connection === 'reconnecting'
  if (!busy && !stopping && !reconnecting) return null

  const last = messages[messages.length - 1]
  const hasAssistantContent = last?.role === 'assistant' && (
    last.steps.length > 0 || Boolean(last.body) || last.results.length > 0 || Boolean(last.imagePlan) || Boolean(last.failure)
  )
  const isGenerating = last?.role === 'assistant' && last.steps.some(step => step.itemId) && last.results.some(result => result.status === 'running')

  if (isGenerating && !stopping && !reconnecting) return null

  if (!hasAssistantContent || reconnecting || stopping) {
    const text = stopping ? '正在停止...' : reconnecting ? '重连中...' : '输出中...'
    return (
      <div className="agent-chat-pending" data-testid="agent-chat-pending" role="status" aria-live="polite">
        <span className="agent-chat-pending-ico"><PendingBrainIcon /></span>
        <span className="agent-status-txt">{text}</span>
        {onStop && busy && (
          <button type="button" className="agent-status-stop" aria-label={stopping ? '正在停止' : '停止生成'} disabled={stopping} onClick={onStop}>
            {stopping ? '停止中…' : '停止'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="agent-chat-progress-dots" role="status" aria-label="生成进行中">
      <span className="lo-dots" aria-hidden="true"><i /><i /><i /></span>
      {onStop && (
        <button type="button" className="agent-status-stop" aria-label={stopping ? '正在停止' : '停止生成'} disabled={stopping} onClick={onStop}>
          {stopping ? '停止中…' : '停止'}
        </button>
      )}
    </div>
  )
}

/** 提问卡回答以「Q：问题 A：答案」发送；气泡里只展示答案，问题作小标签 */
export function parseAskAnswers(text: string): { question: string; answer: string }[] {
  if (!text.startsWith('Q：')) return []
  return text.split(/\n(?=Q：)/).flatMap(line => {
    const one = parseAskAnswer(line)
    return one ? [one] : []
  })
}

export function parseAskAnswer(text: string): { question: string; answer: string } | null {
  const m = /^Q：([\s\S]*?)\s*A：([\s\S]*)$/.exec(text)
  if (!m || !m[2].trim()) return null
  return { question: m[1].trim().replace(/[?？]$/, ''), answer: m[2].trim() }
}

/** 把正文里的 @标签 渲染成带缩略图的引用 */
function renderRefs(text: string, atts: ChatAttachment[], onFocus: (attachment: ChatAttachment) => void) {
  const canvas = atts.filter((a) => a.kind === 'canvas')
  if (!canvas.length) return text
  const parts: React.ReactNode[] = []
  let rest = text, k = 0
  for (;;) {
    let best: { i: number; a: ChatAttachment } | null = null
    for (const a of canvas) { const i = rest.indexOf('@' + a.label); if (i >= 0 && (!best || i < best.i)) best = { i, a } }
    if (!best) break
    const attachment = best.a
    parts.push(rest.slice(0, best.i))
    parts.push(
      <button
        type="button"
        key={k++}
        className="ref"
        onClick={() => onFocus(attachment)}
      >
        <img src={best.a.image.thumbUrl ?? best.a.image.url} alt="" />
        {best.a.label}
      </button>
    )
    rest = rest.slice(best.i + best.a.label.length + 1)
  }
  parts.push(rest)
  return parts
}
