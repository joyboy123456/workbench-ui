'use client'
import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AskMessage } from '@/lib/v2/types'
import { Icon } from '../icons'

export interface AskCardProps {
  ask: AskMessage
  disabled?: boolean
  onSubmit: (ask: AskMessage, selectedKey: string, answerText: string) => void
  onSkip: (ask: AskMessage) => void
}

export function AskCard({ ask, disabled, onSubmit, onSkip }: AskCardProps) {
  const [selectedKey, setSelectedKey] = useState<string>(ask.options[0]?.key ?? 'A')
  const [otherText, setOtherText] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const otherInputRef = useRef<HTMLInputElement>(null)

  const keys = [...ask.options.map((o) => o.key), 'D']

  useEffect(() => {
    setSelectedKey(ask.options[0]?.key ?? 'A')
    setOtherText('')
    cardRef.current?.focus({ preventScroll: true })
  }, [ask.id, ask.options])

  const selectedOption = ask.options.find((o) => o.key === selectedKey)
  const resolvedAnswer = selectedKey === 'D' ? otherText.trim() : (selectedOption?.label ?? '')
  const canSubmit = !disabled && Boolean(resolvedAnswer)

  const submit = () => {
    if (!canSubmit) return
    onSubmit(ask, selectedKey, resolvedAnswer)
  }

  const moveSelection = (delta: number) => {
    const idx = keys.indexOf(selectedKey)
    const nextIdx = (idx + delta + keys.length) % keys.length
    const nextKey = keys[nextIdx]
    setSelectedKey(nextKey)
    if (nextKey === 'D') {
      requestAnimationFrame(() => otherInputRef.current?.focus())
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) onSkip(ask)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (document.activeElement === otherInputRef.current && e.key === 'ArrowRight') return
      e.preventDefault()
      moveSelection(1)
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (document.activeElement === otherInputRef.current && e.key === 'ArrowLeft') return
      e.preventDefault()
      moveSelection(-1)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      ref={cardRef}
      className="ask-card"
      role="region"
      aria-label={ask.question}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="ask-card-head">
        <span className="ask-badge">需要确认</span>
        <strong className="ask-title">{ask.question}</strong>
      </div>

      <div className="ask-options" role="radiogroup" aria-label={ask.question}>
        {ask.options.map((opt) => {
          const on = selectedKey === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={on}
              className={'ask-opt' + (on ? ' on' : '')}
              onClick={() => setSelectedKey(opt.key)}
            >
              <span className="ask-key">{opt.key}</span>
              <span className="ask-opt-body">
                <b>{opt.label}</b>
                {opt.description && <small>{opt.description}</small>}
              </span>
              {on && <Icon name="check" size={14} className="ask-check" />}
            </button>
          )
        })}

        <div
          className={'ask-opt ask-other' + (selectedKey === 'D' ? ' on' : '')}
          role="radio"
          aria-checked={selectedKey === 'D'}
          onClick={() => {
            setSelectedKey('D')
            otherInputRef.current?.focus()
          }}
        >
          <span className="ask-key">D</span>
          <div className="ask-other-wrap">
            <span className="ask-other-lbl">其他</span>
            <input
              ref={otherInputRef}
              type="text"
              value={otherText}
              onFocus={() => setSelectedKey('D')}
              onChange={(e) => {
                setSelectedKey('D')
                setOtherText(e.target.value)
              }}
              placeholder={ask.otherPlaceholder ?? '输入其他要求…'}
              aria-label="其他说明"
            />
          </div>
        </div>
      </div>

      <div className="ask-foot">
        <span className="ask-kbd-hint">↑↓ 切换 · Enter 提交 · Esc 跳过</span>
        <div className="ask-actions">
          <button type="button" className="btn" disabled={disabled} onClick={() => onSkip(ask)}>
            跳过
          </button>
          <button type="button" className="btn pri" disabled={!canSubmit} onClick={submit}>
            提交
          </button>
        </div>
      </div>
    </div>
  )
}
