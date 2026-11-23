'use client'
import { useEffect, useState, useSyncExternalStore, type RefObject, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createValueStore } from '@/lib/v2/value-store'
import { Icon } from './icons'

type InputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { textStore: ReturnType<typeof createValueStore<string>> }
type EditorProps = InputProps & { inputRef: RefObject<HTMLTextAreaElement | null>; expandable: boolean; hint: ReactNode }

export function QuickTextInput({ textStore, ...props }: InputProps) {
  const value = useSyncExternalStore(textStore.subscribe, textStore.getSnapshot, textStore.getSnapshot)
  const firstLine = value.split('\n').find(line => line.trim())
  return (
    <span className="lv-quick-text">
      <textarea {...props} value={value} />
      {/* 未聚焦时输入框只占一行，长草稿改用省略号预览首行；全文留在 textarea 里，聚焦后展开编辑。 */}
      {firstLine && <span className="lv-quick-peek" aria-hidden="true">{firstLine}</span>}
    </span>
  )
}

export function ComposerTextInput({ textStore, inputRef, expandable, hint, ...props }: EditorProps) {
  const text = useSyncExternalStore(textStore.subscribe, textStore.getSnapshot, textStore.getSnapshot)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [editorOverflow, setEditorOverflow] = useState(false)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // 空输入交给 CSS 的 min-height，避免切换模式后沿用上一模式量出的高度。
    el.style.height = 'auto'
    el.style.height = text ? Math.min(el.scrollHeight, 160) + 'px' : ''
  }, [text, props.placeholder])
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const check = () => {
      if (!el.value) { setEditorOverflow(false); setEditorExpanded(false); return }
      setEditorOverflow(el.scrollHeight > el.clientHeight + 2 || el.scrollHeight > 160)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, editorExpanded])
  return (
    <div className={'cp-textarea-wrap' + (editorExpanded ? ' is-expanded' : '')}>
      {(editorOverflow || editorExpanded) && expandable && (
        <button
          type="button"
          className="cp-expand-btn"
          aria-label={editorExpanded ? '收起输入框' : '展开输入框'}
          aria-expanded={editorExpanded}
          title={editorExpanded ? '收起输入框' : '展开编辑长提示词'}
          onClick={() => {
            setEditorExpanded(prev => !prev)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          <Icon name={editorExpanded ? 'chev' : 'expand'} size={12} />
        </button>
      )}
      {hint}
      <textarea {...props} ref={inputRef} value={text} />
    </div>
  )
}
