'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useState, type ReactNode } from 'react'
import { useLoad } from '@/lib/v2/data-source'
import { BrandMark, Icon } from './icons'
import { AccountMenu } from './account-menu'
import { TaskTray } from './task-tray'
import { useV2Auth } from './auth'
import { useV2Theme } from './root'
import { useCreateProject } from './use-create-project'

export const SIDEBAR_STORAGE_KEY = 'v2:sidebar-collapsed'

const NAV = [
  { href: '/v2', label: '首页', icon: 'nav-home', match: (p: string) => p === '/v2' },
  { href: '/v2/tools', label: 'AI工具', icon: 'nav-tools', match: (p: string) => p.startsWith('/v2/tools') },
  { href: '/v2/projects', label: '项目库', icon: 'nav-projects', match: (p: string) => p.startsWith('/v2/projects') },
  { href: '/v2/assets', label: '素材库', icon: 'nav-assets', match: (p: string) => p.startsWith('/v2/assets') },
]

/** 画布外的页面：可展开（图标+文字+最近项目）/ 收起（仅图标）的左侧导航栏，状态持久化在 localStorage */
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? ''
  const router = useRouter()
  const { user, loading: checkingSession, requireAuth } = useV2Auth()
  const { theme, toggleTheme } = useV2Theme()
  const { data: projects, loading: loadingProjects } = useLoad((d) => d.listProjects(), [user?.id], !!user)
  const [collapsed, setCollapsed] = useState(false)
  const [recentOpen, setRecentOpen] = useState(true)

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

  const { create, creating } = useCreateProject()

  const recent = (projects ?? []).slice(0, 6)
  const themeActionLabel = theme === 'dark' ? '切换浅色外观' : '切换深色外观'

  return (
    <div className={'shell' + (collapsed ? ' is-collapsed' : ' is-expanded')}>
      <nav className={'rail' + (collapsed ? ' collapsed' : ' expanded')} aria-label="主导航">
        <div className="rail-top">
          <Link href="/v2" className="rail-brand-link" title="workbench 首页" aria-label="workbench 首页">
            <BrandMark size={22} />
            {!collapsed && <span className="rail-wordmark">workbench</span>}
          </Link>
          <button
            type="button"
            className="ibtn rail-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            data-testid="sidebar-toggle"
          >
            <Icon name={collapsed ? 'sidebar-open' : 'sidebar'} size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className="rail-nav">
          <button type="button" className="n rail-create" disabled={creating} onClick={create} title="新建项目" aria-label="新建项目">
            <Icon name="plus" size={16} strokeWidth={1.7} />
            {!collapsed && <span className="n-lbl">新建项目</span>}
          </button>

          {NAV.map((n) => {
            const active = n.match(path)
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.label}
                aria-label={n.label}
                aria-current={active ? 'page' : undefined}
                className={'n' + (active ? ' on' : '')}
                onClick={e => {
                  if (!user && (n.href === '/v2/projects' || n.href === '/v2/assets')) {
                    e.preventDefault()
                    void requireAuth(() => router.push(n.href))
                  }
                }}
              >
                <Icon name={n.icon} size={16} strokeWidth={1.6} />
                {!collapsed && <span className="n-lbl">{n.label}</span>}
              </Link>
            )
          })}
        </div>

        {!collapsed && (
          <div className="rail-recent">
            <button
              type="button"
              className="rail-sec-btn"
              aria-expanded={recentOpen}
              onClick={() => setRecentOpen((prev) => !prev)}
            >
              <span>最近项目</span>
              <Icon name="chev" size={12} strokeWidth={1.6} className={'rail-sec-caret' + (recentOpen ? '' : ' closed')} />
            </button>
            {recentOpen && (
              <div className="rail-recent-list">
                {!user ? (
                  <span className="rail-recent-empty">{checkingSession ? '加载中…' : '暂无项目'}</span>
                ) : recent.length === 0 ? (
                  <span className="rail-recent-empty">{loadingProjects ? '加载中…' : '暂无项目'}</span>
                ) : (
                  recent.map((p) => (
                    <Link
                      key={p.id}
                      href={`/v2/canvas/${p.id}?view=split`}
                      className="rail-proj"
                      title={p.name}
                    >
                      <span className="rail-proj-txt">{p.name}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="rail-foot">
          {checkingSession ? (
            <div className="rail-session-loading">
              <span className="v2-spinner" role="status" aria-label="正在确认登录状态" />
            </div>
          ) : user ? (
            <>
              <div className="rail-account-row">
                <AccountMenu compact={collapsed} />
              </div>
              <button
                type="button"
                className="rail-util"
                onClick={toggleTheme}
                title={themeActionLabel}
                aria-label={themeActionLabel}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} strokeWidth={1.6} />
                {!collapsed && (
                  <>
                    <span>外观模式</span>
                    <em className="rail-util-tag">{theme === 'dark' ? '深色' : '浅色'}</em>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rail-login-btn"
                onClick={() => { void requireAuth() }}
                title="登录"
                aria-label="登录"
              >
                <span className="rail-guest-av" aria-hidden="true">
                  <Icon name="model" size={14} strokeWidth={1.7} />
                </span>
                {collapsed ? <span className="v2-sr-only">登录</span> : <span>登录</span>}
              </button>
              <button
                type="button"
                className="rail-util"
                onClick={toggleTheme}
                title={themeActionLabel}
                aria-label={themeActionLabel}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} strokeWidth={1.6} />
                {!collapsed && (
                  <>
                    <span>外观模式</span>
                    <em className="rail-util-tag">{theme === 'dark' ? '深色' : '浅色'}</em>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </nav>
      <main className="main">
        {children}
      </main>
      <TaskTray />
    </div>
  )
}
