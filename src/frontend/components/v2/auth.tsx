'use client'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useV2 } from '@/lib/v2/data-source'
import type { V2SessionUser } from '@/lib/v2/session'
import { confirmV2Session } from '@/lib/v2/session'
import { BrandMark, Icon } from './icons'
import { useToast } from './ui'

type Action = () => void | Promise<unknown>
interface Intent { action: Action; resolve: (completed: boolean) => void }
interface AuthState {
  user: V2SessionUser | null
  loading: boolean
  sessionError: string | null
  retrySession: () => Promise<void>
  logout: () => Promise<void>
  requireAuth: (action?: Action) => Promise<boolean>
}
const AuthContext = createContext<AuthState | null>(null)

/** 只暂存本次动作，不写入 storage；取消即丢弃动作，输入仍由原组件保留。 */
export function V2AuthProvider({ children }: { children: ReactNode }) {
  const ds = useV2()
  const toast = useToast()
  const [user, setUser] = useState<V2SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)
  const currentUser = useRef(user)
  const pending = useRef<Intent | null>(null)
  const sessionRequest = useRef<Promise<void> | null>(null)
  const sessionKnown = useRef(false)
  const refreshSession = useRef<() => Promise<void>>(() => Promise.resolve())
  const retrySession = useCallback(() => { setLoading(true); return refreshSession.current() }, [])

  const identityVersion = useRef(0)

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    let inFlight: Promise<void> | undefined
    const refresh = () => {
      if (inFlight) return inFlight
      const version = identityVersion.current
      setSessionError(null)
      inFlight = confirmV2Session(ds, controller.signal).then(
        value => {
          if (alive && version === identityVersion.current) { sessionKnown.current = true; currentUser.current = value; setUser(value); setLoading(false) }
        },
        () => {
          if (alive && version === identityVersion.current) {
            sessionKnown.current = true; currentUser.current = null; setUser(null); setLoading(false)
            setSessionError('暂时无法确认登录状态，请重试或登录')
          }
        },
      ).finally(() => { inFlight = undefined })
      sessionRequest.current = inFlight
      return inFlight
    }
    refreshSession.current = refresh
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive = false; controller.abort()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
      pending.current?.resolve(false); pending.current = null
    }
  }, [ds])

  const logout = async () => {
    identityVersion.current++
    await ds.logout()
    sessionKnown.current = true; currentUser.current = null; setUser(null); setLoading(false); setSessionError(null); setIntent(null)
    pending.current?.resolve(false); pending.current = null
    toast('已退出登录')
  }

  const execute = useCallback(async (action: Action) => {
    try { await action(); return true }
    catch (error) { toast(error instanceof Error ? error.message : '操作失败，请重试'); return false }
  }, [toast])

  const requireAuth = useCallback(async (action: Action = () => {}) => {
    if (!sessionKnown.current) await sessionRequest.current
    if (!sessionKnown.current) { toast('正在确认登录状态，请稍后再试'); return false }
    if (currentUser.current) return execute(action)
    return new Promise<boolean>(resolve => {
      pending.current?.resolve(false)
      const next = { action, resolve }
      pending.current = next
      setIntent(next)
    })
  }, [execute, toast])

  const dismiss = useCallback(() => {
    pending.current?.resolve(false)
    pending.current = null
    setIntent(null)
  }, [])

  const enterDemo = async () => {
    const submittedIntent = pending.current
    const value = await (ds.enterDemo ? ds.enterDemo() : ds.login({ username: 'demo', password: '' }))
    identityVersion.current++
    sessionKnown.current = true; setLoading(false); setSessionError(null)
    currentUser.current = value
    setUser(value)
    // 关闭后才返回的登录请求可以更新身份，但不能续接已取消或新开的动作。
    if (submittedIntent && pending.current === submittedIntent) {
      pending.current = null
      setIntent(null)
      void execute(submittedIntent.action).then(submittedIntent.resolve)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionError, retrySession, requireAuth, logout }}>
      {children}
      {intent && <LoginDialog onClose={dismiss} onSubmit={enterDemo} />}
    </AuthContext.Provider>
  )
}

export function useV2Auth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useV2Auth must be used inside V2AuthProvider')
  return value
}

function LoginDialog({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const alive = useRef(true)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    alive.current = true
    element.setAttribute('closedby', 'any')
    if (!element.open) element.showModal()
    const outside = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    }
    let pressedOutside = false
    const down = (event: PointerEvent) => { pressedOutside = outside(event) }
    const up = (event: PointerEvent) => { if (pressedOutside && outside(event)) element.close() }
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      element.addEventListener('pointerdown', down)
      element.addEventListener('pointerup', up)
    }
    return () => {
      alive.current = false
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointerup', up)
      // DOM 移除会关闭原生 dialog；这里 close 会在 StrictMode 重挂载后投递旧 close 事件。
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    submitting.current = true
    setBusy(true)
    try { await onSubmit() }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '登录失败，请重试') }
    finally { submitting.current = false; if (alive.current) setBusy(false) }
  }

  return (
    <dialog ref={dialog} className="auth-dialog" aria-labelledby="v2-auth-title" aria-describedby="v2-auth-description" onClose={onClose}>
      <button className="ibtn auth-close" type="button" aria-label="关闭登录弹窗" onClick={() => dialog.current?.close()}><Icon name="x" size={18} /></button>
      <div className="auth-brand" aria-hidden="true"><BrandMark size={19} /></div>
      <h2 id="v2-auth-title">进入演示工作台</h2>
      <p id="v2-auth-description">继续刚才的操作，项目和画布保存在当前浏览器。</p>
      <form onSubmit={submit}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="btn pri auth-submit" type="submit" disabled={busy}>{busy ? '正在进入…' : '以演示账号继续'}</button>
      </form>
    </dialog>
  )
}
