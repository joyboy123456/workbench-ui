'use client'
/**
 * 澄清提问卡：按 Lovart InlineQuestions 复刻（async_lovart-canvas.e02aec2435.js，
 * 组件 A/T/w，见 docs/ui-refs/lovart-ask/notes.md）。
 * 结构：头部「提问」+ 翻页「‹ 1 / 3 ›」→ 所有问题在一个滚动区里纵向排列，翻页即平滑滚到该题
 * → 底部「跳过」(描边) +「下一个 / 提交」(主按钮带回车提示)。
 * 交互：单选题点选后自动滚到下一题；最后一题或最后一题已露出时主按钮变「提交」；
 * 至少答一题才能提交；Enter 等同主按钮。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClarificationAnswer } from '@/lib/agent/clarification'
import type { AskMessage, AskQuestion } from '@/lib/v2/types'
import { Icon } from '../icons'

export interface AskCardProps {
  ask: AskMessage
  disabled?: boolean
  onSubmit: (ask: AskMessage, selectedKey: string, answerText: string, answers?: ClarificationAnswer[]) => void | false | Promise<void | false>
  onSkip: (ask: AskMessage) => void | Promise<void>
}

/** 结构化提问（LOOP-03 澄清协议）走 StructuredAskCard；其余走 Lovart 复刻卡。 */
export function AskCard(props: AskCardProps) {
  return props.ask.clarification
    ? <StructuredAskCard key={`${props.ask.clarification.runId}:${props.ask.clarification.revision}`} {...props} />
    : <LovartAskCard {...props} />
}

function StructuredAskCard({ ask, disabled, onSubmit, onSkip }: AskCardProps) {
  const question = ask.clarification!
  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ClarificationAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const heading = useRef<HTMLLegendElement>(null)
  const current = question.questions[page]
  const answer = answers[current.questionId] ?? { questionId: current.questionId, selectedOptionIds: [], customText: '' }
  const blocked = disabled || submitting || question.state !== 'pending' || !question.runtimeSupported
  const update = (value: ClarificationAnswer) => { setAnswers(previous => ({ ...previous, [current.questionId]: value })); setError('') }
  const select = (id: string) => update({ ...answer, customText: current.spec.selection === 'single' ? '' : answer.customText,
    selectedOptionIds: current.spec.selection === 'multiple'
      ? answer.selectedOptionIds.includes(id) ? answer.selectedOptionIds.filter(value => value !== id) : [...answer.selectedOptionIds, id]
      : [id] })
  const move = (index: number) => { setPage(index); requestAnimationFrame(() => heading.current?.focus()) }
  const complete = (value?: ClarificationAnswer) => Boolean(value && (value.selectedOptionIds.length || value.customText.trim()))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (blocked || lock.current) return
    if (!complete(answer)) { setError('请选择或填写这一题的答案'); return }
    if (page < question.questions.length - 1) { move(page + 1); return }
    const missing = question.questions.findIndex(item => !complete(answers[item.questionId]))
    if (missing >= 0) { move(missing); setError('请回答所有问题'); return }
    lock.current = true; setSubmitting(true)
    try { await onSubmit(ask, 'structured', '', question.questions.map(item => answers[item.questionId])) }
    catch (error) { setError(error instanceof Error ? error.message : '答复状态待核实，请刷新查看') }
    finally { lock.current = false; setSubmitting(false) }
  }
  const abandon = async () => {
    if (disabled || lock.current) return
    lock.current = true; setSubmitting(true)
    try { await onSkip(ask) }
    catch (error) { setError(error instanceof Error ? error.message : '跳过失败，请刷新查看') }
    finally { lock.current = false; setSubmitting(false) }
  }
  return <form className="ask-card" aria-label="提问" onSubmit={submit}>
    <div className="ask-head">
      <div className="ask-head-l">
        <Icon name="askq" size={16} />
        <p>提问</p>
      </div>
      {question.questions.length > 1 && (
        <div className="ask-pager" aria-live="polite">
          <button type="button" aria-label="上一题" disabled={blocked || page <= 0} onClick={() => move(page - 1)}><Icon name="chevL" size={16} /></button>
          <span>{page + 1}</span><span>/</span><span>{question.questions.length}</span>
          <button type="button" aria-label="下一题" disabled={blocked || page >= question.questions.length - 1} onClick={() => move(page + 1)}><Icon name="chevR" size={16} /></button>
        </div>
      )}
    </div>
    <fieldset className="ask-fields" disabled={blocked}>
      <legend ref={heading} tabIndex={-1} className="ask-q">{current.spec.question}{current.spec.selection === 'multiple' ? '（多选）' : ''}</legend>
      <div className="ask-opts">
        {current.spec.options.map((option, index) => <label key={option.id} className={'ask-opt' + (answer.selectedOptionIds.includes(option.id) ? ' on' : '')}>
          <input className="visually-hidden" type={current.spec.selection === 'multiple' ? 'checkbox' : 'radio'} name={current.questionId} value={option.id}
            checked={answer.selectedOptionIds.includes(option.id)} onChange={() => select(option.id)} />
          <span className="ask-key">{String.fromCharCode(65 + index)}</span><span className="ask-lbl">{option.label}</span>
        </label>)}
        {current.spec.allowCustom && <label className={'ask-opt ask-other' + (current.spec.selection === 'text' ? ' is-text' : '') + (answer.customText.trim() ? ' on' : '')}>
          {current.spec.selection === 'text'
            ? <span className="visually-hidden">填写答案</span>
            : <span className="ask-key">{letter(current.spec.options.length)}</span>}
          <input
            type="text"
            name={`${current.questionId}-custom`}
            aria-label={current.spec.selection === 'text' ? '填写答案' : '其它'}
            placeholder={current.spec.selection === 'text' ? '请输入...' : '其它...'}
            maxLength={2000}
            value={answer.customText}
            onChange={event => update({ ...answer, customText: event.target.value, selectedOptionIds: current.spec.selection === 'single' ? [] : answer.selectedOptionIds })}
          />
        </label>}
      </div>
    </fieldset>
    {!question.runtimeSupported && <p className="ask-msg" role="status">请跳过后直接发送补充说明。</p>}
    {error && <p className="ask-msg ask-err" role="alert">{error}</p>}
    <div className="ask-foot">
      <button type="button" className="ask-btn ghost" disabled={disabled || submitting} onClick={() => void abandon()}>跳过</button>
      <button type="submit" className="ask-btn pri" disabled={blocked}>
        {submitting ? '提交中...' : page < question.questions.length - 1 ? '下一个' : '提交'}<Icon name="enter" size={12} />
      </button>
    </div>
  </form>
}

/** 兼容旧的单题结构：没有 questions 时用 question/options 拼出一题，末尾补一个「其它」输入 */
export function askQuestions(ask: AskMessage): AskQuestion[] {
  if (ask.questions?.length) return ask.questions
  return [{ question: ask.question, mode: 'single', options: ask.options, otherPlaceholder: ask.otherPlaceholder ?? '其它' }]
}

const letter = (n: number) => (n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(65 + Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26)))

/** 把作答拼成发给 Agent 的文本：每题一行「Q：问题 A：答案」 */
export function formatAskAnswers(questions: AskQuestion[], picks: Record<number, Set<number>>, drafts: Record<number, string>) {
  const lines: string[] = []
  const keys: string[] = []
  questions.forEach((q, qi) => {
    const sel = picks[qi] ?? new Set<number>()
    const parts: string[] = []
    q.options.forEach((o, oi) => { if (sel.has(oi)) { parts.push(o.label); keys.push(letter(oi)) } })
    const otherIndex = q.options.length
    const custom = (drafts[qi] ?? '').trim()
    if (sel.has(otherIndex) && custom) { parts.push(custom); keys.push(letter(otherIndex)) }
    if (parts.length) lines.push(`Q：${q.question} A：${parts.join('、')}`)
  })
  return { text: lines.join('\n'), keys: keys.join(',') }
}

function LovartAskCard({ ask, disabled, onSubmit, onSkip }: AskCardProps) {
  const questions = useMemo(() => askQuestions(ask), [ask])
  const total = questions.length
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Record<number, Set<number>>>({})
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [lastSeen, setLastSeen] = useState(total <= 1)
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<number, HTMLDivElement>())
  const inputRefs = useRef(new Map<number, HTMLTextAreaElement>())

  useEffect(() => {
    setIndex(0); setPicks({}); setDrafts({}); setLastSeen(total <= 1)
    const t = setTimeout(() => rootRef.current?.focus({ preventScroll: true }), 200)
    return () => clearTimeout(t)
  }, [ask.id, total])

  // 最后一题露出即可提交（Lovart：IntersectionObserver 观察最后一项）
  useEffect(() => {
    const root = scrollRef.current
    const last = itemRefs.current.get(total - 1)
    if (!root || !last || total <= 1 || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { setLastSeen(true); io.disconnect() } }, { root })
    io.observe(last)
    return () => io.disconnect()
  }, [total, ask.id])

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= total) return
    setIndex(i)
    const el = itemRefs.current.get(i)
    const root = scrollRef.current
    if (el && root) root.scrollTo({ top: el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop, behavior: 'smooth' })
  }, [total])

  const isPicked = (qi: number, oi: number) => Boolean(picks[qi]?.has(oi))
  const pick = (qi: number, oi: number, mode: AskQuestion['mode']) => {
    const cur = picks[qi] ?? new Set<number>()
    let next: Set<number>
    let added = false
    if (mode === 'multiple') { next = new Set(cur); if (next.has(oi)) next.delete(oi); else { next.add(oi); added = true } }
    else { next = new Set([oi]); added = true }
    setPicks(prev => ({ ...prev, [qi]: next }))
    return added
  }
  const ensurePicked = (qi: number, oi: number, mode: AskQuestion['mode']) => {
    if (isPicked(qi, oi)) return
    setPicks(prev => ({ ...prev, [qi]: mode === 'multiple' ? new Set(prev[qi] ?? []).add(oi) : new Set([oi]) }))
  }

  const answers = useMemo(() => formatAskAnswers(questions, picks, drafts), [questions, picks, drafts])
  const hasAnswer = Boolean(answers.text)
  const submitMode = index === total - 1 || lastSeen
  const continueDisabled = Boolean(disabled) || (submitMode && !hasAnswer)

  const handleContinue = () => {
    if (continueDisabled) return
    if (submitMode) onSubmit(ask, answers.keys, answers.text)
    else goTo(index + 1)
  }

  const onOption = (qi: number, oi: number) => {
    if (disabled) return
    const q = questions[qi]
    const added = pick(qi, oi, q.mode)
    if (q.mode !== 'multiple' && added && qi < total - 1) requestAnimationFrame(() => goTo(qi + 1))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault(); e.stopPropagation(); handleContinue()
  }

  return (
    <div ref={rootRef} className="ask-card" tabIndex={-1} onKeyDown={onKeyDown} role="region" aria-label="提问">
      <div className="ask-head">
        <div className="ask-head-l">
          <Icon name="askq" size={16} />
          <p>提问</p>
        </div>
        {total > 1 && (
          <div className="ask-pager">
            <button type="button" aria-label="上一题" disabled={index <= 0} onClick={() => goTo(index - 1)}><Icon name="chevL" size={16} /></button>
            <span>{index + 1}</span><span>/</span><span>{total}</span>
            <button type="button" aria-label="下一题" disabled={index >= total - 1} onClick={() => goTo(index + 1)}><Icon name="chevR" size={16} /></button>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="ask-scroll">
        {questions.map((q, qi) => {
          const otherIndex = q.options.length
          const draft = drafts[qi] ?? ''
          const otherOn = isPicked(qi, otherIndex) && draft.trim() !== ''
          return (
            <div key={qi} className="ask-item" ref={(el) => { if (el) itemRefs.current.set(qi, el); else itemRefs.current.delete(qi) }}>
              <p className="ask-q">{q.question}{q.mode === 'multiple' && '（多选）'}</p>
              <div className="ask-opts" role={q.mode === 'multiple' ? 'group' : 'radiogroup'} aria-label={q.question}>
                {q.options.map((o, oi) => {
                  const on = isPicked(qi, oi)
                  return (
                    <button key={o.key + oi} type="button" role={q.mode === 'multiple' ? 'checkbox' : 'radio'} aria-checked={on}
                      className={'ask-opt' + (on ? ' on' : '')} disabled={disabled} onClick={() => onOption(qi, oi)}>
                      <span className="ask-key">{letter(oi)}</span>
                      <span className="ask-lbl">{o.label}{o.description && <small>{o.description}</small>}</span>
                    </button>
                  )
                })}
                <div role="button" tabIndex={disabled ? -1 : 0} className={'ask-opt ask-other' + (otherOn ? ' on' : '')}
                  onClick={() => { if (disabled) return; ensurePicked(qi, otherIndex, q.mode); requestAnimationFrame(() => inputRefs.current.get(qi)?.focus()) }}>
                  <span className="ask-key">{letter(otherIndex)}</span>
                  <textarea
                    ref={(el) => { if (el) inputRefs.current.set(qi, el); else inputRefs.current.delete(qi) }}
                    rows={1}
                    value={draft}
                    disabled={disabled}
                    placeholder={(q.otherPlaceholder ?? '其它') + '...'}
                    aria-label="其它"
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => ensurePicked(qi, otherIndex, q.mode)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault() }}
                    onChange={(e) => { const v = e.target.value.replace(/\s*[\r\n]+\s*/g, ' '); setDrafts(d => ({ ...d, [qi]: v })) }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ask-foot">
        <button type="button" className="ask-btn ghost" disabled={disabled} onClick={() => onSkip(ask)}>跳过</button>
        <button type="button" className="ask-btn pri" disabled={continueDisabled} onClick={handleContinue}>
          {submitMode ? '提交' : '下一个'}<Icon name="enter" size={12} />
        </button>
      </div>
    </div>
  )
}
