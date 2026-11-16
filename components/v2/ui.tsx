'use client'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ImageRef } from '@/lib/v2/types'
import { Icon, type IconName } from './icons'

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- 点外面 / Esc 关闭 ---------- */
export function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>, trigger?: HTMLElement | null) {
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !trigger?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0)
    document.addEventListener('keydown', key)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open, onClose, ref, trigger])
}

/** 定位在屏幕坐标 (x, y) 的菜单，会自动避开右/下边缘并计算弹出方向 */
export function FloatingMenu({ x, y, onClose, children, width = 220, label, trigger }: { x: number; y: number; onClose: () => void; children: ReactNode; width?: number; label?: string; trigger?: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y, ox: '0%', oy: '0%' })
  useDismiss(true, onClose, ref, trigger)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const nx = Math.min(x, window.innerWidth - el.offsetWidth - 8)
    const ny = Math.min(y, window.innerHeight - el.offsetHeight - 8)
    const ox = nx < x ? '100%' : '0%'
    const oy = ny < y ? '100%' : '0%'
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny), ox, oy })
    const resize = () => {
      setPos({ x: Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)), y: Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8)), ox, oy })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    window.addEventListener('resize', resize)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
  }, [x, y])
  useLayoutEffect(() => {
    if (!label || !ref.current) return
    const el = ref.current
    const previous = trigger ?? document.activeElement
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    return () => {
      if (el.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [label, trigger])
  const host = label && typeof document !== 'undefined' ? document.querySelector('.v2') : null
  const content = (
    <div
      ref={ref}
      className={'menu' + (label ? ' canvas-actions-menu' : '')}
      role={label ? 'menu' : undefined}
      aria-label={label}
      onKeyDown={(event) => {
        if (!label) return
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
        if (event.key === 'Tab') { onClose(); return }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
        event.preventDefault(); event.stopPropagation(); buttons[next]?.focus()
      }}
      style={{ left: pos.x, top: pos.y, width, transformOrigin: `${pos.ox} ${pos.oy}` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
  return host ? createPortal(content, host) : content
}

/* ---------- 滑动指示条标签栏 ---------- */
export function SlidingTabs<T extends string>({
  tabs,
  active,
  onChange,
  small,
  style,
}: {
  tabs: readonly { id: T; name: string }[]
  active: T
  onChange: (id: T) => void
  small?: boolean
  style?: CSSProperties
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const btn = wrap.querySelector<HTMLElement>(`[data-tab="${active}"]`)
    if (btn) setInd({ x: btn.offsetLeft, w: btn.offsetWidth })
  }, [active])

  useLayoutEffect(() => {
    measure()
  }, [measure, tabs])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  return (
    <div ref={wrapRef} className={'tabs-u' + (ind ? ' has-ind' : '') + (small ? ' sm' : '')} style={style} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          data-tab={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? 'on' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.name}
        </button>
      ))}
      {ind && <span className="tab-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} aria-hidden />}
    </div>
  )
}

/* ---------- 弹窗 ---------- */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, ref)
  return (
    <div className="modal-bg">
      <div className="modal" ref={ref} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer && <div className="ft">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- 大图预览 ---------- */
export function Preview({ image, onClose }: { image: ImageRef; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="preview-bg" onClick={onClose}><img src={image.url} alt="" /></div>
  )
}

/** 图片或占位块，支持可选悬停浮层 */
export function Thumb({ image, label, cover, ratio34, overlay }: { image?: ImageRef; label?: string; cover?: boolean; ratio34?: boolean; overlay?: ReactNode }) {
  const cls = 'ph2' + (ratio34 ? ' r34' : '') + (cover ? ' cov' : '')
  if (!image?.url) {
    return (
      <div className={cls + ' ph0'}>
        {label ?? '占位'}
        {overlay}
      </div>
    )
  }
  return (
    <div className={cls}>
      <img src={image.thumbUrl ?? image.url} alt={label ?? ''} draggable={false} />
      {overlay}
    </div>
  )
}

/** 卡片网格骨架 */
export function CardSkeleton({ count = 6, ratio34 = false }: { count?: number; ratio34?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, k) => (
        <div key={k} className="pc" style={{ '--i': k } as CSSProperties} aria-hidden>
          <div className={'ph2 skel' + (ratio34 ? ' r34' : '')} />
          <div className="skel-line" />
          <div className="skel-line sm" />
        </div>
      ))}
    </>
  )
}

/** 插画化空状态 */
export function EmptyState({ icon = 'img', title, subtitle, action }: { icon?: IconName; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={22} /></div>
      <div className="empty-title">{title}</div>
      {subtitle && <div className="empty-sub">{subtitle}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

export function relTime(iso: string) {
  const d = new Date(iso), now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return `${diff} 天前`
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 选文件 */
export function pickFiles(accept = 'image/*', multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept; input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}
