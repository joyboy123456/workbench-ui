import type { ReactNode } from 'react'
import { V2Root } from '@/components/v2/root'
import '@xyflow/react/dist/style.css'
import './v2.css'

export const metadata = { title: '商拍生成工作台' }

export default function V2Layout({ children }: { children: ReactNode }) {
  return <V2Root>{children}</V2Root>
}
