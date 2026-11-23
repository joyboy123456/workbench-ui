'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CaseExample, ToolCatalogItem } from '@/lib/v2/types'
import { CaseGallery } from './case-gallery'
import { Icon } from './icons'

/** 工具案例抽屉：该工具的全部真实案例（瀑布流 + 详情 + 做同款） */
export function ToolCasesDrawer({ tool, onClose, onMakeSame }: { tool: ToolCatalogItem; onClose: () => void; onMakeSame: (c: CaseExample) => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.querySelector<HTMLElement>('.v2') ?? document.body) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cs-dlg')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!host) return null
  return createPortal(
    <div className="tl-cases-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tl-cases-sheet" role="dialog" aria-modal="true" aria-label={`${tool.name} 案例`}>
        <header>
          <div>
            <b>{tool.name}</b>
            <small>{tool.caseCount} 个真实案例 · {tool.desc}</small>
          </div>
          <button type="button" className="ibtn" onClick={onClose} aria-label="关闭"><Icon name="x" size={14} /></button>
        </header>
        <div className="tl-cases-body" ref={bodyRef}>
          <CaseGallery toolId={tool.id} onMakeSame={onMakeSame} maxColumns={4} pageSize={20} scrollRoot={bodyRef} />
        </div>
      </div>
    </div>,
    host,
  )
}
