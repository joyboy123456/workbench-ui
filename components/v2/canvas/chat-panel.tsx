'use client'
import Link from 'next/link'
import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AgentMode, AskMessage, AssistantMessage, ChatAttachment, ChatMessage, ImageRef, Project } from '@/lib/v2/types'
import { Composer, type ComposerSubmission } from '../composer'
import { Icon } from '../icons'
import { useDismiss, useToast } from '../ui'
import { AskCard } from './ask-card'
import { GenerationArtwork, GenerationStep, useChatResultOutput } from './generation-state'

export type SessionView = 'chat' | 'split'

export interface ChatPanelProps {
  project: Project
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  onSend: (text: string, mode: AgentMode, submission?: ComposerSubmission) => void | Promise<void>
  onAnswerAsk?: (ask: AskMessage, selectedKey: string, answerText: string) => void | Promise<void>
  onSkipAsk?: (ask: AskMessage) => void
  canvasImages: { id: string; label: string; image: ImageRef }[]
  busy: boolean
  onStop?: () => void
  stopping?: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
  onRename: (name: string) => void
  onNewProject: () => void
  onFocusResult: (generationId: string, messageId?: string) => void
  view: SessionView
  collapsed: boolean
  onCollapseChange: (collapsed: boolean) => void
  onViewChange: (view: SessionView) => void
  onExpandCanvas: () => void
  autoExpandCanvas?: boolean
  onAutoExpandCanvasChange?: (next: boolean) => void
  selectedGenIds?: string[]
  credits?: number
  avatar?: string
}

const STEP_ICON = { think: 'info', image: 'img', doc: 'doc', tool: 'wand' } as const

function parseRatioText(ratio?: string): { width: number; height: number } | undefined {
  if (!ratio) return undefined
  const m = ratio.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/)
  if (!m) return undefined
  const w = Number(m[1]), h = Number(m[2])
  return w > 0 && h > 0 ? { width: w, height: h } : undefined
}

function ChatResultCard({
  result,
  index,
  spec,
  selected,
  isChatView,
  onFocus,
}: {
  result: AssistantMessage['results'][number]
  index: number
  spec?: string
  selected: boolean
  isChatView: boolean
  onFocus: () => void
}) {
  const { output, variant } = useChatResultOutput(result.id, result.itemId)
  const size = output?.item.targetSize ?? result.targetSize ?? parseRatioText(result.ratio) ?? result.image ?? parseRatioText(spec) ?? { width: 3, height: 4 }
  const arW = Math.max(1, size.width)
  const arH = Math.max(1, size.height)
  const isWide = arW / arH >= 1.2
  const style = { '--i': index, aspectRatio: `${arW} / ${arH}` } as CSSProperties

  if (result.image?.url && result.status === 'done') {
    return (
      <div
        className={'rs-card' + (isWide ? ' wide' : '') + (selected ? ' sel' : '')}
        style={style}
        onClick={onFocus}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus() } }}
        title={isChatView ? '点击展开画布并定位此图' : '在画布中定位'}
      >
        <img src={result.image.thumbUrl ?? result.image.url} alt="" draggable={false} />
        <span className="rs-ov">
          <Icon name="canvas" size={11} />
          {isChatView ? '展开画布' : '定位画布'}
        </span>
      </div>
    )
  }

  if (result.status === 'failed') {
    return (
      <button
        type="button"
        className={'rs-skel rs-failed-card node failed' + (isWide ? ' wide' : '')}
        style={style}
        onClick={onFocus}
        title="点击在画布中查看或重试"
      >
        <Icon name="alert" size={15} />
        <span>未完成</span>
        <span className="gen-unbilled">未扣费</span>
      </button>
    )
  }

  const phase = output?.item.generationPhase ?? result.generationPhase ?? 'queued'
  const pct = output ? output.display.percent : (phase === 'queued' ? undefined : (result.progress ?? 0))
  const pctLabel = phase === 'processing' ? '99%' : pct !== undefined ? `${pct}%` : '0%'
  const stageLabel =
    phase === 'queued'
      ? '排队中'
      : phase === 'processing'
        ? '载入中'
        : phase === 'unconfirmed'
          ? '确认中'
          : '生成中'

  return (
    <div
      className={'rs-skel node gen' + (isWide ? ' wide' : '') + ` phase-${phase}`}
      style={style}
      role="status"
      aria-label={`第 ${index + 1} 张 ${stageLabel} ${pctLabel}`}
    >
      <GenerationArtwork variant={variant} />
      <span className="gen-pill tnum"><i aria-hidden />{pctLabel}</span>
      <span className="gen-stage-pill">{stageLabel}</span>
      <div className="generation-caption">
        {pct !== undefined && <progress value={pct} max={100} />}
      </div>
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

/** 正文：段落 + 无序列表 + 打字机式流式逐字显示 */
function Body({ text, streaming }: { text: string; streaming?: boolean }) {
  const reducedMotion = useReducedMotion()
  const [visibleLen, setVisibleLen] = useState(() => (streaming && !reducedMotion ? 0 : text.length))

  useEffect(() => {
    if (!streaming || reducedMotion) {
      setVisibleLen(text.length)
      return
    }
    if (visibleLen >= text.length) return
    const timer = window.setTimeout(() => {
      setVisibleLen((prev) => Math.min(text.length, prev + 2))
    }, 24)
    return () => window.clearTimeout(timer)
  }, [text, streaming, reducedMotion, visibleLen])

  const shown = streaming && !reducedMotion ? text.slice(0, visibleLen) : text
  const showCursor = Boolean(streaming && !reducedMotion)

  if (!shown && showCursor) {
    return (
      <p style={{ color: 'var(--tx)' }}>
        <span className="stream-cursor" aria-hidden />
      </p>
    )
  }

  const blocks = shown.split(/\n{2,}/)
  return (
    <div className="ab-body-wrap">
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1
        const cursor = isLast && showCursor ? <span className="stream-cursor" aria-hidden /> : null
        const lines = b.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  {l.slice(2)}
                  {j === lines.length - 1 ? cursor : null}
                </li>
              ))}
            </ul>
          )
        }
        const [first, ...rest] = lines
        if (rest.length && rest.every((l) => l.startsWith('- '))) {
          return (
            <div key={i}>
              <p>{first}</p>
              <ul>
                {rest.map((l, j) => (
                  <li key={j}>
                    {l.slice(2)}
                    {j === rest.length - 1 ? cursor : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        return (
          <p key={i} style={i === 0 ? { color: 'var(--tx)' } : undefined}>
            {b}
            {cursor}
          </p>
        )
      })}
    </div>
  )
}

export function ChatPanel(p: ChatPanelProps) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [votes, setVotes] = useState<Record<string, 'up' | 'down'>>({})
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [showScrollLatest, setShowScrollLatest] = useState(false)
  const [draft, setDraft] = useState<{ text: string; seq: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stickBottomRef = useRef(true)
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef)

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current
    if (!el) return
    stickBottomRef.current = true
    setShowScrollLatest(false)
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  useEffect(() => {
    if (!stickBottomRef.current) return
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [p.messages])

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

  const isChatView = p.view === 'chat'
  const isCollapsed = p.view === 'split' && p.collapsed

  return (
    <aside
      className={'fp view-' + p.view + (isCollapsed ? ' collapsed' : '')}
      aria-label="对话"
      aria-hidden={isCollapsed || undefined}
    >
      <div className="fh" ref={menuRef}>
        <Link href="/v2" className="lg" title="回到首页" aria-label="回到首页">品</Link>
        <button className="pj" onClick={() => setMenuOpen((o) => !o)} title={p.project.name}>
          <span key={p.project.name} className="pj-txt pj-txt-in">{p.project.name}</span>
          <span className="pj-caret">▾</span>
        </button>
        <div className="ib">
          {isChatView ? (
            <>
              <span className="fh-cred tnum" title="剩余积分">
                <Icon name="zap" size={12} />
                {p.credits ?? '–'}
              </span>
              <span
                className="fh-av"
                style={p.avatar ? { backgroundImage: `url(${p.avatar})` } : undefined}
              />
              {p.onAutoExpandCanvasChange && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(p.autoExpandCanvas)}
                  className={'fh-auto-sw' + (p.autoExpandCanvas ? ' on' : '')}
                  onClick={() => p.onAutoExpandCanvasChange?.(!p.autoExpandCanvas)}
                  title="开启后，确认开始出图时自动切成「对话 · 参考 · 画布」；关闭时保持纯对话，点图再展开"
                  data-testid="auto-expand-switch"
                >
                  <span className="sw-track" aria-hidden><i /></span>
                  <span>出图自动展画布</span>
                </button>
              )}
              <button className="ibtn" title="新建项目" aria-label="新建项目" onClick={p.onNewProject}>
                <Icon name="plus" size={16} />
              </button>
              <button
                className="btn fh-open-canvas"
                onClick={p.onExpandCanvas}
                title="展开画布"
                aria-label="展开画布"
                data-testid="expand-canvas-btn"
              >
                <Icon name="canvas" size={15} />
                <span>展开画布</span>
                {p.canvasImages.length > 0 && <b className="cnt tnum">{p.canvasImages.length}</b>}
              </button>
            </>
          ) : (
            <>
              <button className="ibtn" title="新建项目" aria-label="新建项目" onClick={p.onNewProject}>
                <Icon name="plus" size={16} />
              </button>
              <button
                className={'ibtn' + (p.drawerOpen ? ' on' : '')}
                title="资产"
                aria-label="资产"
                onClick={p.onToggleDrawer}
              >
                <Icon name="asset" size={16} />
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
            <Link className="mi" href="/v2/projects"><Icon name="canvas" />所有项目</Link>
            <button className="mi" onClick={() => { setMenuOpen(false); p.onNewProject() }}><Icon name="plus" />新建项目</button>
            <button className="mi" onClick={() => { setMenuOpen(false); const n = window.prompt('项目名称', p.project.name); if (n?.trim()) p.onRename(n.trim()) }}><Icon name="doc" />重命名</button>
            {p.onAutoExpandCanvasChange && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(p.autoExpandCanvas)}
                className="mi"
                onClick={() => p.onAutoExpandCanvasChange?.(!p.autoExpandCanvas)}
              >
                <Icon name="canvas" />
                出图自动展画布
                <small>{p.autoExpandCanvas ? '已开启' : '已关闭'}</small>
              </button>
            )}
            <div className="sep" />
            <Link className="mi" href="/v2"><Icon name="home" />回到首页</Link>
            <Link className="mi" href="/v2/assets"><Icon name="asset" />资产<small>商品 · 模特 · 品牌</small></Link>
            <Link className="mi" href="/v2/assets?tab=history"><Icon name="hist" />生成记录</Link>
            <div className="sep" />
            <button className="mi" onClick={() => { setMenuOpen(false); toast('新手教程（占位）') }}><Icon name="info" />新手教程</button>
          </div>
        )}
      </div>

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
              return (
                <div key={m.id} className="ub">
                  {m.attachments.length > 0 && (
                    <div className="at">
                      {m.attachments.filter(a => a.kind !== 'canvas' || !m.text.includes('@' + a.label)).map((a) => (
                        <button type="button" className="message-ref" key={`${a.kind}:${a.id}`} aria-label={`引用 ${a.label}`} title={a.label}
                          onClick={() => p.onFocusResult(a.kind === 'canvas' ? a.id : a.image.id, m.id)}>
                          <img src={a.image.thumbUrl ?? a.image.url} alt="" />
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {renderRefs(m.text, m.attachments, (id) => p.onFocusResult(id, m.id))}
                </div>
              )
            }
            if (m.role === 'ask') {
              return (
                <div key={m.id} className="ab ask-msg">
                  {m.reason && <p>{m.reason}</p>}
                  {m.skipped && <div className="sl done"><Icon name="check" size={12} /><span className="sl-txt">已跳过该问题</span></div>}
                </div>
              )
            }
            return (
              <div key={m.id} className="ab">
                {m.steps.map((s, i) => {
                  if (s.itemId) return <GenerationStep key={s.itemId} itemId={s.itemId} label={s.label} />
                  const active = s.status === 'running' || (s.status !== 'done' && s.status !== 'failed' && (s.label.includes('中') || Boolean(s.progress && s.progress.done < s.progress.total)))
                  const done = !active && s.status !== 'failed'
                  const canExpand = Boolean(s.collapsible || s.detail)
                  const stepKey = `${m.id}:${i}`
                  const expanded = Boolean(expandedSteps[stepKey])
                  return (
                    <div key={i} className="sl-wrap">
                      <div
                        className={'sl' + (active ? ' active' : '') + (done ? ' done' : '') + (canExpand ? ' collapsible' : '')}
                        role={canExpand ? 'button' : undefined}
                        tabIndex={canExpand ? 0 : undefined}
                        aria-expanded={canExpand ? expanded : undefined}
                        onClick={canExpand ? () => setExpandedSteps(prev => ({ ...prev, [stepKey]: !prev[stepKey] })) : undefined}
                        onKeyDown={canExpand ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedSteps(prev => ({ ...prev, [stepKey]: !prev[stepKey] }))
                          }
                        } : undefined}
                      >
                        <Icon name={done ? 'check' : STEP_ICON[s.icon]} size={12} />
                        <span className="sl-txt">{s.label}{s.progress && ` · 生成中 ${s.progress.done} / ${s.progress.total}`}</span>
                        {canExpand && <Icon name="chev" size={11} className={'sl-caret' + (expanded ? ' open' : '')} />}
                        {active && <i className="pulse-dot" aria-hidden />}
                      </div>
                      {canExpand && expanded && s.detail && (
                        <div className="sl-detail">{s.detail}</div>
                      )}
                    </div>
                  )
                })}
                {m.results.length > 0 && (
                  <div className="rs">
                    {m.results.map((r, idx) => (
                      <ChatResultCard
                        key={r.id}
                        result={r}
                        index={idx}
                        spec={m.meta?.spec}
                        selected={Boolean(p.selectedGenIds?.includes(r.id))}
                        isChatView={isChatView}
                        onFocus={() => p.onFocusResult(r.id, m.id)}
                      />
                    ))}
                  </div>
                )}
                {m.meta?.spec && <div className="ab-spec tnum">{m.meta.spec}</div>}
                {m.body && <Body text={m.body} streaming={m.streaming} />}
                {m.meta?.highlights && m.meta.highlights.length > 0 && (
                  <div className="ab-highlights">
                    <div className="ab-sec-t">这一版落实的几点</div>
                    <ul>
                      {m.meta.highlights.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>
                )}
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
                {m.body && !m.streaming && (
                  <div className="fb">
                    <button className={votes[m.id] === 'up' ? 'on' : ''} title="有用" aria-label="有用" onClick={() => setVotes((v) => ({ ...v, [m.id]: 'up' }))}><Icon name="up2" size={13} /></button>
                    <button className={votes[m.id] === 'down' ? 'on' : ''} title="没用" aria-label="没用" onClick={() => setVotes((v) => ({ ...v, [m.id]: 'down' }))}><Icon name="dn2" size={13} /></button>
                    <button title="复制" aria-label="复制" onClick={() => { navigator.clipboard?.writeText(m.body ?? ''); toast('已复制') }}><Icon name="copy" size={13} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showScrollLatest && (
        <button type="button" className="scroll-latest-btn" onClick={() => scrollToBottom(true)}>
          <Icon name="chev" size={13} />
          <span>回到最新</span>
        </button>
      )}

      <div className="cp-col">
        {activeAsk && (
          <AskCard
            ask={activeAsk}
            disabled={p.busy}
            onSubmit={(ask, selectedKey, answerText) => {
              if (p.onAnswerAsk) {
                void p.onAnswerAsk(ask, selectedKey, answerText)
              } else {
                void p.onSend(`Q：${ask.question} A：${answerText}`, 'agent')
              }
            }}
            onSkip={(ask) => p.onSkipAsk?.(ask)}
          />
        )}
        <Composer
          attachments={p.attachments}
          onAttachmentsChange={p.onAttachmentsChange}
          onSend={p.onSend}
          canvasImages={p.canvasImages}
          busy={p.busy}
          onStop={p.onStop}
          stopping={p.stopping}
          draft={draft}
        />
      </div>
    </aside>
  )
}

/** 把正文里的 @标签 渲染成带缩略图的引用 */
function renderRefs(text: string, atts: ChatAttachment[], onFocus?: (id: string) => void) {
  const canvas = atts.filter((a) => a.kind === 'canvas')
  if (!canvas.length) return text
  const parts: React.ReactNode[] = []
  let rest = text, k = 0
  for (;;) {
    let best: { i: number; a: ChatAttachment } | null = null
    for (const a of canvas) { const i = rest.indexOf('@' + a.label); if (i >= 0 && (!best || i < best.i)) best = { i, a } }
    if (!best) break
    const targetId = best.a.id
    parts.push(rest.slice(0, best.i))
    parts.push(
      <span
        key={k++}
        className="ref"
        style={{ cursor: onFocus ? 'pointer' : undefined }}
        onClick={() => onFocus?.(targetId)}
      >
        <img src={best.a.image.thumbUrl ?? best.a.image.url} alt="" />
        {best.a.label}
      </span>
    )
    rest = rest.slice(best.i + best.a.label.length + 1)
  }
  parts.push(rest)
  return parts
}
