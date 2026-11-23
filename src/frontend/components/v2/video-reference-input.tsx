'use client'
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChatAttachment } from '@/lib/v2/types'
import type { createValueStore } from '@/lib/v2/value-store'
import { videoImageMentions } from '@/lib/v2/video-image-mentions'
import { Icon } from './icons'

type Props = {
  images: ChatAttachment[]
  store: ReturnType<typeof createValueStore<string>>
  onChange: (value: string) => void
  onSend: () => void
  onFiles: (files: File[]) => void
  placeholder: string
  expandable: boolean
}

// The editable contains text nodes and indivisible inline spans. All offsets refer
// to the plain prompt so native selections and the submitted text use the same units.
function selectionOffsets(root: HTMLElement) {
  const selection = root.ownerDocument.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null
  const range = selection.getRangeAt(0)
  const prefix = range.cloneRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(range.startContainer, range.startOffset)
  const start = prefix.toString().length
  return { start, end: start + range.toString().length }
}

function caret(root: HTMLElement, offset: number) {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  for (const node of root.childNodes) {
    const length = node.textContent?.length ?? 0
    if (offset <= length) {
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, offset)
      else if (offset === 0) range.setStartBefore(node)
      else range.setStartAfter(node)
      range.collapse(true)
      break
    }
    offset -= length
  }
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function chip(image: ChatAttachment, number: number) {
  const el = document.createElement('span')
  el.className = 'cp-image-mention'
  el.contentEditable = 'false'
  el.dataset.assetId = image.image.id
  el.title = image.label
  const thumb = document.createElement('img')
  thumb.src = image.image.thumbUrl ?? image.image.url
  thumb.alt = ''
  thumb.draggable = false
  el.append(thumb, '@图片' + number)
  return el
}

export function VideoReferenceInput({ images, store, onChange, onSend, onFiles, placeholder, expandable }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const listId = useId()
  const [active, setActive] = useState(0)
  const [trigger, setTrigger] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)

  function decorate(el: HTMLElement, editing: boolean) {
    const offsets = editing ? selectionOffsets(el) : null
    let position = 0
    let cursor = offsets?.start ?? 0
    let changed = false
    for (const node of Array.from(el.childNodes)) {
      const text = node.textContent ?? ''
      if (node.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment()
        let end = 0
        for (const token of videoImageMentions(text)) {
          const image = images[token.number - 1]
          // Wait for a delimiter before completing the numeral under the caret (e.g. 图十二).
          if (!image || offsets && position + token.start < offsets.end && offsets.start <= position + token.end) continue
          fragment.append(text.slice(end, token.start), chip(image, token.number))
          if (offsets && position + token.end < offsets.start) cursor += ('@图片' + token.number).length - (token.end - token.start)
          end = token.end
        }
        if (end) {
          fragment.append(text.slice(end))
          node.replaceWith(fragment)
          changed = true
        }
      }
      position += text.length
    }
    if (changed && offsets && offsets.start === offsets.end) caret(el, cursor)
    return el.textContent ?? ''
  }

  useLayoutEffect(() => {
    const el = root.current
    if (!el || composing.current) return
    if (value !== el.textContent) el.textContent = value
    for (const token of el.querySelectorAll<HTMLElement>('[data-asset-id]')) {
      const index = images.findIndex(image => image.image.id === token.dataset.assetId)
      if (index < 0) token.remove()
      else if (token.textContent !== '@图片' + (index + 1)) token.replaceWith(chip(images[index], index + 1))
    }
    const text = decorate(el, el === document.activeElement)
    if (text !== value) onChange(text)
    setOverflow(el.scrollHeight > 160)
  })

  function input() {
    const el = root.current
    if (!el || composing.current) return
    // Browsers can leave a lone <br> after deleting the last character.
    if (!el.textContent) el.replaceChildren()
    const text = decorate(el, true)
    const at = selectionOffsets(el)
    setTrigger(at && at.start === at.end && /[@＠]$/.test(text.slice(0, at.start)) ? at.start - 1 : null)
    setActive(0)
    onChange(text)
  }

  function replace(start: number, end: number, insert: string, imageIndex?: number) {
    const el = root.current
    if (!el) return
    const text = el.textContent ?? ''
    const next = text.slice(0, start) + insert + text.slice(end)
    if (next.length > 3600) return
    el.textContent = next
    const after = start + insert.length
    caret(el, after)
    if (imageIndex !== undefined) {
      decorate(el, false)
      caret(el, after)
    }
    input()
  }

  const menu = trigger !== null && images.length > 0
  function select(index: number) {
    if (trigger === null || !images[index]) return
    replace(trigger, trigger + 1, '@图片' + (index + 1), index)
    setTrigger(null)
  }

  return <div className={'cp-textarea-wrap cp-reference-wrap' + (expanded ? ' is-expanded' : '')}>
    {expandable && (overflow || expanded) && <button type="button" className="cp-expand-btn"
      aria-label={expanded ? '收起输入框' : '展开输入框'} aria-expanded={expanded}
      onClick={() => { setExpanded(!expanded); root.current?.focus() }}><Icon name={expanded ? 'chev' : 'expand'} size={12} /></button>}
    <div ref={root} contentEditable suppressContentEditableWarning role="combobox" aria-label="描述需求"
      aria-multiline="true" aria-autocomplete="list" aria-expanded={menu} aria-controls={menu ? listId : undefined}
      aria-activedescendant={menu ? listId + '-' + active : undefined} data-placeholder={placeholder}
      className="cp-reference-editor" onInput={input} onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={() => { composing.current = false; input() }}
      onBlur={event => { setTrigger(null); if (!composing.current) onChange(decorate(event.currentTarget, false)) }}
      onClick={() => setTrigger(null)}
      onBeforeInput={event => {
        const el = event.currentTarget
        const data = (event.nativeEvent as InputEvent).data
        const selected = selectionOffsets(el)
        if (data && selected && !composing.current && (el.textContent ?? '').length - selected.end + selected.start + data.length > 3600) event.preventDefault()
      }}
      onDrop={event => { if (!event.dataTransfer.files.length && !event.dataTransfer.types.includes('application/x-v2-asset')) event.preventDefault() }}
      onPaste={event => {
        event.preventDefault()
        const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
        if (files.length) { onFiles(files); return }
        const selected = selectionOffsets(event.currentTarget)
        if (selected) replace(selected.start, selected.end, event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
      }}
      onKeyDown={event => {
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return
        if (menu && ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Tab'].includes(event.key)) {
          event.preventDefault()
          if (event.key === 'Escape') setTrigger(null)
          else if (event.key === 'Enter' || event.key === 'Tab') select(active)
          else setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + images.length) % images.length)
          return
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          const el = event.currentTarget
          const selected = selectionOffsets(el)
          if (selected && selected.start === selected.end) {
            let start = 0
            for (const node of el.childNodes) {
              const end = start + (node.textContent?.length ?? 0)
              if (node instanceof HTMLElement && node.dataset.assetId &&
                (event.key === 'Backspace' ? selected.start === end : selected.start === start)) {
                event.preventDefault()
                node.remove()
                caret(el, start)
                input()
                return
              }
              start = end
            }
          }
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const selected = selectionOffsets(event.currentTarget)
          if (event.shiftKey && selected) replace(selected.start, selected.end, '\n')
          else if (!event.shiftKey) onSend()
        } else if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') setTrigger(null)
      }} />
    {menu && <div className="cp-reference-list" role="listbox" id={listId} aria-label="引用已选参考图">
      {images.map((image, index) => <button type="button" role="option" key={image.image.id} id={listId + '-' + index}
        aria-selected={active === index} tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => select(index)}>
        <img src={image.image.thumbUrl ?? image.image.url} alt="" />图片{index + 1}<small>{image.label}</small>
      </button>)}
    </div>}
  </div>
}
