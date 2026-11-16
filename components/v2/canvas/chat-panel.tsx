'use client'
import Link from 'next/link'
import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AgentMode, ChatAttachment, ChatMessage, ImageRef, Project } from '@/lib/v2/types'
import { Composer, type ComposerSubmission } from '../composer'
import { Icon } from '../icons'
import { useDismiss, useToast } from '../ui'
import { GenerationStep } from './generation-state'

export type SessionView = 'chat' | 'split'

export interface ChatPanelProps {
  project: Project
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  onAttachmentsChange: (a: ChatAttachment[]) => void
  onSend: (text: string, mode: AgentMode, submission?: ComposerSubmission) => void | Promise<void>
  canvasImages: { id: string; label: string; image: ImageRef }[]
  busy: boolean
  onStop?: () => void
  stopping?: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
  onRename: (name: string) => void
  onNewProject: () => void
  onFocusResult: (generationId: string) => void
  view: SessionView
  collapsed: boolean
  onCollapseChange: (collapsed: boolean) => void
  onViewChange: (view: SessionView) => void
  onExpandCanvas: () => void
  selectedGenIds?: string[]
  credits?: number
  avatar?: string
}

const STEP_ICON = { think: 'info', image: 'img', doc: 'doc', tool: 'wand' } as const

/** 正文：段落 + 无序列表 */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => l.startsWith('- '))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
        const [first, ...rest] = lines
        if (rest.length && rest.every((l) => l.startsWith('- '))) return <div key={i}><p>{first}</p><ul>{rest.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul></div>
        return <p key={i} style={i === 0 ? { color: 'var(--tx)' } : undefined}>{b}</p>
      })}
    </>
  )
}

export function ChatPanel(p: ChatPanelProps) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [votes, setVotes] = useState<Record<string, 'up' | 'down'>>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [p.messages])

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
          <span className="pj-txt">{p.project.name}</span>
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
            <div className="sep" />
            <Link className="mi" href="/v2"><Icon name="home" />回到首页</Link>
            <Link className="mi" href="/v2/assets"><Icon name="asset" />资产<small>商品 · 模特 · 品牌</small></Link>
            <Link className="mi" href="/v2/assets?tab=history"><Icon name="hist" />生成记录</Link>
            <div className="sep" />
            <button className="mi" onClick={() => { setMenuOpen(false); toast('新手教程（占位）') }}><Icon name="info" />新手教程</button>
          </div>
        )}
      </div>

      <div className="ms" ref={listRef}>
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
          {p.messages.map((m) => m.role === 'user' ? (
            <div key={m.id} className="ub">
              {m.attachments.length > 0 && (
                <div className="at">
                  {m.attachments.filter(a => a.kind !== 'canvas' || !m.text.includes('@' + a.label)).map((a) => (
                    <button type="button" className="message-ref" key={`${a.kind}:${a.id}`} aria-label={`引用 ${a.label}`} title={a.label}
                      onClick={() => p.onFocusResult(a.kind === 'canvas' ? a.id : a.image.id)}>
                      <img src={a.image.thumbUrl ?? a.image.url} alt="" />
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {renderRefs(m.text, m.attachments, p.onFocusResult)}
            </div>
          ) : (
            <div key={m.id} className="ab">
              {m.steps.map((s, i) => {
                if (s.itemId) return <GenerationStep key={s.itemId} itemId={s.itemId} label={s.label} />
                const active = s.label.includes('中') || Boolean(s.progress && s.progress.done < s.progress.total)
                return (
                  <div key={i} className={'sl' + (active ? ' active' : '')}>
                    <Icon name={STEP_ICON[s.icon]} size={12} />
                    <span className="sl-txt">{s.label}{s.progress && ` · 生成中 ${s.progress.done} / ${s.progress.total}`}</span>
                    {active && <i className="pulse-dot" aria-hidden />}
                  </div>
                )
              })}
              {m.results.length > 0 && (
                <div className="rs">
                  {m.results.map((r, idx) => r.image?.url && r.status === 'done'
                    ? (
                      <div
                        key={r.id}
                        className={'rs-card' + (p.selectedGenIds?.includes(r.id) ? ' sel' : '')}
                        style={{ '--i': idx } as CSSProperties}
                        onClick={() => p.onFocusResult(r.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onFocusResult(r.id) } }}
                        title={isChatView ? '点击展开画布并定位此图' : '在画布中定位'}
                      >
                        <img src={r.image.thumbUrl ?? r.image.url} alt="" draggable={false} />
                        <span className="rs-ov">
                          <Icon name="canvas" size={11} />
                          {isChatView ? '展开画布' : '定位画布'}
                        </span>
                      </div>
                    )
                    : r.status === 'failed' ? <span key={r.id}>未完成</span> : <b key={r.id} style={{ '--i': idx } as CSSProperties} className="rs-skel shimmer" />)}
                </div>
              )}
              {m.body && <Body text={m.body} />}
              {m.body && (
                <div className="fb">
                  <button className={votes[m.id] === 'up' ? 'on' : ''} title="有用" onClick={() => setVotes((v) => ({ ...v, [m.id]: 'up' }))}><Icon name="up2" size={13} /></button>
                  <button className={votes[m.id] === 'down' ? 'on' : ''} title="没用" onClick={() => setVotes((v) => ({ ...v, [m.id]: 'down' }))}><Icon name="dn2" size={13} /></button>
                  <button title="复制" onClick={() => { navigator.clipboard?.writeText(m.body ?? ''); toast('已复制') }}><Icon name="copy" size={13} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cp-col">
        <Composer
          attachments={p.attachments}
          onAttachmentsChange={p.onAttachmentsChange}
          onSend={p.onSend}
          canvasImages={p.canvasImages}
          busy={p.busy}
          onStop={p.onStop}
          stopping={p.stopping}
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
