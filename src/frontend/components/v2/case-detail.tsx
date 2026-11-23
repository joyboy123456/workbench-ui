'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CaseExample } from '@/lib/v2/types'
import { CASE_CATEGORY_LABEL } from '@/lib/v2/case-categories'
import { Icon } from './icons'

/** 案例详情：大图、所需素材提示、所用能力、做同款（不暴露内部长提示词与模型配比；参考图是案例任务的输入，浏览时不展示，只在做同款时带入输入框）。←/→ 切换，Esc 关闭。 */
export function CaseDetail({ cases, index, onIndexChange, onClose, onMakeSame }: {
  cases: CaseExample[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  onMakeSame: (c: CaseExample) => void
}) {
  const c = cases[index]
  const [loaded, setLoaded] = useState<string | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setHost(document.querySelector<HTMLElement>('.v2') ?? document.body) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && index < cases.length - 1) onIndexChange(index + 1)
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [index, cases.length, onClose, onIndexChange])
  useEffect(() => { panelRef.current?.focus() }, [])

  if (!c || !host) return null
  const meta = [c.meta?.aspectRatio, c.meta?.resolution?.toUpperCase()].filter(Boolean).join(' · ')
  const hints = c.inputHint?.length ? c.inputHint : ['服装商品图']

  return createPortal(
    <div className="cs-dlg-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cs-dlg" role="dialog" aria-modal="true" aria-label={c.title} tabIndex={-1} ref={panelRef}>
        <div className="cs-dlg-stage">
          {c.video ? (
            <video key={c.id} src={c.video.url} poster={c.image.url} controls playsInline preload="none"
              width={c.image.width} height={c.image.height} aria-label={c.title} />
          ) : <>
            {loaded !== c.id && <span className="cs-dlg-load"><span className="cs-spin" aria-hidden /></span>}
            <img key={c.id} src={c.image.url} alt={c.title} className={loaded === c.id ? 'ok' : ''} onLoad={() => setLoaded(c.id)} style={{ backgroundImage: c.image.thumbUrl ? `url(${c.image.thumbUrl})` : undefined }} />
          </>}
          {index > 0 && <button type="button" className="cs-nav l" onClick={() => onIndexChange(index - 1)} aria-label="上一个"><Icon name="left" size={16} /></button>}
          {index < cases.length - 1 && <button type="button" className="cs-nav r" onClick={() => onIndexChange(index + 1)} aria-label="下一个"><Icon name="right" size={16} /></button>}
        </div>
        <aside className="cs-dlg-side">
          <button type="button" className="cs-x ibtn" onClick={onClose} aria-label="关闭"><Icon name="x" size={14} /></button>
          <div className="cs-tags">
            {c.category && <span className="cs-tag">{CASE_CATEGORY_LABEL[c.category]}</span>}
            {c.date && <span className="cs-tag dim tnum">{c.date}</span>}
            {meta && <span className="cs-tag dim tnum">{meta}</span>}
          </div>
          <h3>{c.title}</h3>
          {c.toolName && <div className="cs-tool"><Icon name="zap" size={13} />{c.toolName}</div>}

          <section className="cs-sec">
            <h4>做同款准备</h4>
            <p className="cs-prompt open">上传你的{hints.join('、')}，Agent 将自动沿用该案例的构图、光影与版式完成创作。</p>
          </section>

          <div className="cs-dlg-ft">
            <button type="button" className="cs-primary" onClick={() => onMakeSame(c)}><Icon name="wand" size={14} />做同款</button>
            <small>进入画布 Agent 对话，一键复刻同款效果</small>
          </div>
          <div className="cs-dlg-pos tnum">{index + 1} / {cases.length}</div>
        </aside>
      </div>
    </div>,
    host,
  )
}
