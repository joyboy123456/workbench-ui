'use client'
import React, { useEffect, useId, useRef, useState } from 'react'
import type { CanvasItem, Project } from '@/lib/v2/types'
import { Icon } from '../icons'
import { ExportDialog } from './export-dialog'

export const CANVAS_SHORTCUTS = [
  { title: '缩放预览', rows: [['放大', 'Ctrl / ⌘ +'], ['缩小', 'Ctrl / ⌘ −'], ['重置为 100%', 'Ctrl / ⌘ 0'], ['显示全部', 'Shift 1'], ['定位选中', 'Shift 2'], ['缩放画布', 'Ctrl / ⌘ + 滚轮'], ['预览图片', '双击图片']] },
  { title: '移动画布', rows: [['选择工具', 'V'], ['抓手工具', 'H'], ['临时抓手', '按住空格并拖动'], ['移动画布', '滚轮 / 中键拖动'], ['拖动时临时关闭吸附', '按住 Ctrl / ⌘']] },
  { title: '其他', rows: [['撤销', 'Ctrl / ⌘ Z'], ['重做', 'Ctrl / ⌘ Shift Z'], ['全选', 'Ctrl / ⌘ A'], ['微调选中位置', '← → ↑ ↓（Shift 10px）'], ['复制选中图片', 'Ctrl / ⌘ C'], ['粘贴图片', 'Ctrl / ⌘ V'], ['删除选中图片', 'Delete / Backspace'], ['退出焦点编辑 / 取消选择', 'Esc']] },
]

export function ShortcutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => { if (close.current) close.current.autofocus = true; ref.current?.showModal() }, [])
  return <dialog ref={ref} className="nav-dialog nav-shortcuts" aria-labelledby={id} onClose={onClose} onKeyDown={event => event.stopPropagation()}>
    <header><h2 id={id}>快捷键</h2><button ref={close} type="button" className="ibtn" aria-label="关闭快捷键" onClick={() => ref.current?.close()}><Icon name="x" /></button></header>
    <div className="nav-shortcut-groups">{CANVAS_SHORTCUTS.map(group => <section key={group.title}><h3>{group.title}</h3><dl>{group.rows.map(([label, keys]) => <div key={label}><dt>{label}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl></section>)}</div>
    <p>画布可见且焦点不在输入框或弹窗时生效。Ctrl / ⌘ 对应 Windows / macOS。</p>
  </dialog>
}

export function CanvasTools({ project, items, selected, tool, onTool, focused, onFocus, onUpload, past, future, onUndo, onRedo }: {
  project: Project; items: CanvasItem[]; selected: string[]; tool: 'select' | 'hand'; onTool: (tool: 'select' | 'hand') => void
  focused: boolean; onFocus: () => void; onUpload: () => void; past: number; future: number; onUndo: () => void; onRedo: () => void
}) {
  const [shortcuts, setShortcuts] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = bar.current
    if (!element || 'focusGroup' in HTMLElement.prototype) return
    const controls = () => [...element.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.disabled)
    const update = (target = controls()[0]) => { for (const button of element.querySelectorAll('button')) button.tabIndex = button === target ? 0 : -1 }
    update()
    const focus = (event: FocusEvent) => { if (event.target instanceof HTMLButtonElement) update(event.target) }
    const key = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const buttons = controls()
      const current = buttons.findIndex(button => button === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length
      event.preventDefault(); buttons[next]?.focus()
    }
    element.addEventListener('focusin', focus); element.addEventListener('keydown', key)
    return () => { element.removeEventListener('focusin', focus); element.removeEventListener('keydown', key) }
  }, [past, future])
  return <>
    <div ref={bar} className="bt nav-canvas-tools" role="toolbar" aria-label="画布工具" {...{ focusgroup: 'toolbar wrap' }}>
      <button type="button" className={tool === 'select' ? 'on' : ''} aria-label="选择" aria-pressed={tool === 'select'} title="选择 V" onClick={() => onTool('select')}><Icon name="cur" /><span className="bt-label">选择</span></button>
      <button type="button" className={tool === 'hand' ? 'on' : ''} aria-label="抓手" aria-pressed={tool === 'hand'} title="抓手 H / 按住空格" onClick={() => onTool('hand')}><Icon name="hand" /><span className="bt-label">抓手</span></button>
      <button type="button" aria-label="焦点编辑" aria-pressed={focused} className={focused ? 'on' : ''} title={focused ? '退出焦点编辑 Esc' : '选中一张图片后进入焦点编辑'} onClick={onFocus}><Icon name="focus" /><span className="bt-label">焦点编辑</span></button>
      <button type="button" aria-label="添加图片" title="添加图片 · 支持拖拽、粘贴" onClick={onUpload}><Icon name="plus" /><span className="bt-label">添加</span></button>
      <span className="dv" role="separator" aria-orientation="vertical" />
      <button type="button" disabled={!past} aria-label="撤销" title="撤销 Ctrl / ⌘ Z" onClick={onUndo}><Icon name="undo" /></button>
      <button type="button" disabled={!future} aria-label="重做" title="重做 Ctrl / ⌘ Shift Z" onClick={onRedo}><Icon name="redo" /></button>
      <span className="dv" role="separator" aria-orientation="vertical" />
      <button type="button" aria-label="快捷键" title="快捷键" aria-haspopup="dialog" onClick={() => setShortcuts(true)}><Icon name="kbd" /></button>
      <ExportDialog compact project={project} items={items} selected={selected} />
    </div>
    {shortcuts && <ShortcutDialog onClose={() => setShortcuts(false)} />}
  </>
}
