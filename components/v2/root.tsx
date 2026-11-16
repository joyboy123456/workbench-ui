'use client'
import { useMemo, type ReactNode } from 'react'
import { V2Provider } from '@/lib/v2/data-source'
import { createMockDataSource } from '@/lib/v2/mock'
import { ToastProvider } from './ui'
import { V2AuthProvider } from './auth'

/**
 * 纯前端仓库：只用本地 mock 数据源（lib/v2/mock.ts），数据存在浏览器 localStorage。
 */
export function V2Root({ children }: { children: ReactNode }) {
  const source = useMemo(() => createMockDataSource(), [])
  return (
    <div className="v2 dark">
      <V2Provider source={source}>
        <ToastProvider><V2AuthProvider>{children}</V2AuthProvider></ToastProvider>
      </V2Provider>
      <div className="proto-note">V2 预览 · mock 数据，商品名、模特名、张数、积分均为占位</div>
    </div>
  )
}
