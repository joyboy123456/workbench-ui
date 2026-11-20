import type { ReactNode } from 'react'
import "./globals.css"

export const metadata = { title: '商拍生成工作台' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
