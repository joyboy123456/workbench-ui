'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { Icon } from './icons'
import { TaskTray } from './task-tray'
import { useV2Auth } from './auth'

export const SIDEBAR_STORAGE_KEY = 'v2:sidebar-collapsed'

const NAV = [
  { href: '/v2', label: '首页', icon: 'home', match: (p: string) => p === '/v2' },
  { href: '/v2/tools', label: 'AI工具', icon: 'grid', match: (p: string) => p.startsWith('/v2/tools') },
  { href: '/v2/projects', label: '项目', icon: 'canvas', match: (p: string) => p.startsWith('/v2/projects') },
  { href: '/v2/assets', label: '资产', icon: 'asset', match: (p: string) => p.startsWith('/v2/assets') },
]

/** 画布外的页面：可展开（图标+文字+最近项目）/ 收起（仅图标）的左侧导航栏，状态持久化在 localStorage */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? ''
  const ds = useV2()
  const router = useRouter()
  const { user, loading, requireAuth } = useV2Auth()
  const { data: account } = useLoad((d) => d.getAccount(), [user?.id], !!user)
  const { data: projects } = useLoad((d) => d.listProjects(), [user?.id], !!user)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved === '1' || saved === 'true') setCollapsed(true)
    } catch {
      // ignore storage errors
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const create = () => requireAuth(async () => {
    const p = await ds.createProject({})
    router.push(`/v2/canvas/${p.id}?view=chat`)
  })

  const recent = (projects ?? []).slice(0, 6)

  return (
    <div className={'shell' + (collapsed ? ' is-collapsed' : ' is-expanded')}>
      <nav className={'rail' + (collapsed ? ' collapsed' : ' expanded')} aria-label="主导航">
        <div className="rail-top">
          <Link href="/v2" className="logo" title="首页" aria-label="首页">品</Link>
          <button
            className="ibtn rail-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            data-testid="sidebar-toggle"
          >
            <Icon name={collapsed ? 'sidebar-open' : 'sidebar'} size={18} />
          </button>
        </div>

        <button className="rail-create" onClick={create} title="新建项目" aria-label="新建项目">
          <Icon name="plus" size={18} />
          {!collapsed && <span>新建项目</span>}
        </button>

        <div className="rail-nav">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              aria-label={n.label}
              className={'n' + (n.match(path) ? ' on' : '')}
              onClick={e => {
                if (!user && (n.href === '/v2/projects' || n.href === '/v2/assets')) {
                  e.preventDefault()
                  void requireAuth(() => router.push(n.href))
                }
              }}
            >
              <Icon name={n.icon} size={18} />
              {!collapsed && <span className="n-lbl">{n.label}</span>}
            </Link>
          ))}
        </div>

        {!collapsed && (
          <div className="rail-recent">
            <div className="rail-sec">最近项目</div>
            <div className="rail-recent-list">
              {recent.length === 0 && <span className="rail-recent-empty">{user ? '还没有项目' : '登录后查看最近项目'}</span>}
              {recent.map((p) => (
                <Link
                  key={p.id}
                  href={`/v2/canvas/${p.id}?view=split`}
                  className="rail-proj"
                  title={p.name}
                >
                  <span className="rail-proj-txt">{p.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rail-foot">
          {!user ? <span className="rail-guest" title="登录后保存创作">{collapsed ? '品' : '登录后保存你的创作'}</span> : collapsed ? (
            <>
              <div
                className="av"
                title={account?.name}
                style={account?.avatar ? { backgroundImage: `url(${account.avatar})` } : undefined}
              />
            </>
          ) : (
            <div className="rail-user">
              <div
                className="av"
                title={account?.name}
                style={account?.avatar ? { backgroundImage: `url(${account.avatar})` } : undefined}
              />
              <span className="rail-uname">{account?.name ?? '店铺账号'}</span>
            </div>
          )}
        </div>
      </nav>
      <main className="main">
        {!user && <div className="guest-topbar"><button className="btn pri" disabled={loading} onClick={() => { void requireAuth() }}>{loading ? '检查登录…' : '登录'}</button></div>}
        {children}
      </main>
      <TaskTray />
    </div>
  )
}
