'use client'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useV2 } from '@/lib/v2/data-source'
import type { V2LoginInput, V2RegisterInput, V2SessionUser } from '@/lib/v2/session'
import { Icon } from './icons'
import { useToast } from './ui'

type Action = () => void | Promise<unknown>
interface Intent { action: Action; resolve: (completed: boolean) => void }
interface AuthState {
  user: V2SessionUser | null
  loading: boolean
  requireAuth: (action?: Action) => Promise<boolean>
}
const AuthContext = createContext<AuthState | null>(null)

/** 只暂存本次动作，不写入 storage；取消即丢弃动作，输入仍由原组件保留。 */
export function V2AuthProvider({ children }: { children: ReactNode }) {
  const ds = useV2()
  const toast = useToast()
  const [user, setUser] = useState<V2SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [intent, setIntent] = useState<Intent | null>(null)
  const currentUser = useRef(user)
  const pending = useRef<Intent | null>(null)
  const sessionRequest = useRef<Promise<void> | null>(null)
  const executing = useRef(false)

  useEffect(() => {
    let alive = true
    sessionRequest.current = ds.getSession().then(
      value => { if (alive) { currentUser.current = value; setUser(value) } },
      () => { /* 会话检查失败时仍可浏览公开内容；使用时再登录。 */ },
    ).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; pending.current?.resolve(false); pending.current = null }
  }, [ds])

  const execute = useCallback(async (action: Action) => {
    if (executing.current) return false
    executing.current = true
    try { await action(); return true }
    catch (error) { toast(error instanceof Error ? error.message : '操作失败，请重试'); return false }
    finally { executing.current = false }
  }, [toast])

  const requireAuth = useCallback(async (action: Action = () => {}) => {
    await sessionRequest.current
    if (currentUser.current) return execute(action)
    return new Promise<boolean>(resolve => {
      pending.current?.resolve(false)
      const next = { action, resolve }
      pending.current = next
      setIntent(next)
    })
  }, [execute])

  const dismiss = useCallback(() => {
    pending.current?.resolve(false)
    pending.current = null
    setIntent(null)
  }, [])

  const authenticate = async (input: V2LoginInput | V2RegisterInput) => {
    const submittedIntent = pending.current
    const value = 'inviteCode' in input ? await ds.register(input) : await ds.login(input)
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
    <AuthContext.Provider value={{ user, loading, requireAuth }}>
      {children}
      {intent && <LoginDialog onClose={dismiss} onSubmit={authenticate} />}
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
  onSubmit: (input: V2LoginInput | V2RegisterInput) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const usernameInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const submitting = useRef(false)
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    alive.current = true
    element.setAttribute('closedby', 'any')
    if (usernameInput.current) usernameInput.current.autofocus = true
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
    if (register && password !== confirm) { setError('两次输入的密码不一致'); return }
    submitting.current = true
    setBusy(true)
    try { await onSubmit(register ? { username, password, inviteCode } : { username, password }) }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '登录失败，请重试') }
    finally { submitting.current = false; if (alive.current) setBusy(false) }
  }

  return (
    <dialog ref={dialog} className="auth-dialog" aria-labelledby="v2-auth-title" aria-describedby="v2-auth-description" onClose={onClose}>
      <button className="ibtn auth-close" type="button" aria-label="关闭登录弹窗" onClick={() => dialog.current?.close()}><Icon name="x" size={18} /></button>
      <div className="auth-brand" aria-hidden="true">品</div>
      <h2 id="v2-auth-title">{register ? '注册账号' : '登录，继续创作'}</h2>
      <p id="v2-auth-description">{register ? '使用邀请码注册，完成后继续刚才的操作' : '登录后继续刚才的操作，输入内容会为你保留'}</p>
      <form onSubmit={submit}>
        <label>用户名<input ref={usernameInput} autoFocus name="username" autoComplete="username" required maxLength={register ? 32 : 64} minLength={register ? 3 : 1} pattern={register ? '[a-zA-Z0-9_-]+' : undefined} value={username} onChange={e => setUsername(e.target.value)} placeholder={register ? '3–32 位字母、数字、下划线或连字符' : '输入用户名'} /></label>
        <label>密码<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 6 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={register ? '至少 6 个字符' : '输入密码'} /></label>
        {register && <>
          <label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="再次输入密码" /></label>
          <label>邀请码<input name="inviteCode" autoComplete="off" required minLength={4} maxLength={64} value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="输入有效邀请码" /></label>
        </>}
        <div className="auth-error" role="alert" aria-live="polite">{error}</div>
        <button className="btn pri auth-submit" type="submit" disabled={busy}>{busy ? (register ? '正在注册…' : '正在登录…') : (register ? '注册并继续' : '登录并继续')}</button>
      </form>
      <p className="auth-switch">{register ? '已有账号？' : '还没有账号？'}<button type="button" disabled={busy} onClick={() => { setRegister(value => !value); setError('') }}>{register ? '返回登录' : '邀请码注册'}</button></p>
    </dialog>
  )
}
