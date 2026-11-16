import type { ReactNode } from 'react'
import { V2Root } from '@/components/v2/root'
import './v2.css'

export const metadata = { title: '电商素材工作台 · V2 预览' }

export default function V2Layout({ children }: { children: ReactNode }) {
  return <V2Root>{children}</V2Root>
}
