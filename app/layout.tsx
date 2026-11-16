import type { ReactNode } from 'react'

export const metadata = { title: '电商素材工作台' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: '#181818' }}>{children}</body>
    </html>
  )
}
