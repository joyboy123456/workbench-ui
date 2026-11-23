'use client'
import React, { useCallback, useId, useRef, useState } from 'react'
import { useV2Auth } from './auth'
import { Icon } from './icons'
import { useV2Theme } from './root'
import { useDismiss, useToast } from './ui'

/** Shared session control. Account I/O stays behind useV2 in AuthProvider. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, loading, sessionError, retrySession, requireAuth, logout } = useV2Auth()
  const { theme, toggleTheme } = useV2Theme()
  const toast = useToast()
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = useCallback(() => { setOpen(false); trigger.current?.focus() }, [])
  useDismiss(open, close, wrapper)
  if (loading) return <span className="v2-spinner" role="status" aria-label="正在确认登录状态" />
  if (!user) return <div className="account-menu-wrap">
    {sessionError && <button type="button" className="btn" title={sessionError} aria-label="重试登录状态" onClick={() => { void retrySession() }}>重试</button>}
    <button type="button" className="btn pri" onClick={() => { void requireAuth() }}>登录</button>
  </div>
  const name = user.displayName || user.username
  return <div ref={wrapper} className="account-menu-wrap">
    <button ref={trigger} type="button" className="account-trigger" aria-label={`账号菜单：${name}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar" aria-hidden>{name.slice(0, 1)}</span>{!compact && <span>{name}</span>}
    </button>
    {open && <div id={id} className="account-menu" role="group" aria-label="账号">
      <strong>{name}</strong><small>{user.username}</small>
      <button type="button" onClick={toggleTheme} className="account-theme-btn">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
        <span>{theme === 'dark' ? '切换浅色外观' : '切换深色外观'}</span>
      </button>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await logout(); close() } catch (error) { toast(error instanceof Error ? error.message : '退出失败，请重试') }
        finally { setBusy(false) }
      }}>{busy ? '正在退出…' : '退出登录'}</button>
    </div>}
  </div>
}
