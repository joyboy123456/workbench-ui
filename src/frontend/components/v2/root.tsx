'use client'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource } from '@/lib/v2/mock'
import { ToastProvider } from './ui'
import { V2AuthProvider } from './auth'

export type V2Theme = 'light' | 'dark'
const V2_THEME_KEY = 'v2:theme'
const ThemeCtx = createContext<{ theme: V2Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} })
export const useV2Theme = () => useContext(ThemeCtx)

/**
 * 默认对齐 Lovart 2.0 浅色外观，可在账号菜单切换深色模式并持久化。
 */
export function V2Root({ children }: { children: ReactNode }) {
  const source = useMemo(() => createMockDataSource(), [])
  const [theme, setTheme] = useState<V2Theme>('light')
  useEffect(() => {
    try {
      const saved = localStorage.getItem(V2_THEME_KEY)
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch { /* ignore storage errors */ }
  }, [])
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: V2Theme = prev === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(V2_THEME_KEY, next) } catch { /* ignore */ }
      return next
    })
  }, [])
  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  return (
    <div className={'v2' + (theme === 'dark' ? ' is-dark dark' : ' is-light')}>
      <ThemeCtx.Provider value={themeValue}>
        <V2Provider source={source}>
          <ToastProvider><V2AuthProvider>{children}</V2AuthProvider></ToastProvider>
        </V2Provider>
      </ThemeCtx.Provider>
      <div className="proto-note">V2 前端演示 · 数据保存在当前浏览器</div>
    </div>
  )
}
