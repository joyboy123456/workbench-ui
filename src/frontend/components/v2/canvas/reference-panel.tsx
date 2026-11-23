'use client'
import React, { useId, useState } from 'react'
import { useLoad } from '@/lib/v2/data-source'
import { useV2Auth } from '../auth'
import type { CanvasItem, ChatAttachment } from '@/lib/v2/types'
import { findCanvasItemForReference } from '@/lib/v2/canvas-references'
import { Icon } from '../icons'

const KIND_LABEL: Record<ChatAttachment['kind'], string> = {
  product: '商品',
  model: '模特',
  canvas: '@引用',
  material: '素材',
  upload: '上传',
  brand: '品牌',
}

export function ReferencePanel({
  references,
  previous = false,
  items,
  selectedIds,
  tab: controlledTab,
  onTabChange,
  onUploadReference,
  onCollapse,
  onSelectReference,
  onAddMaterial,
}: {
  references: ChatAttachment[]
  previous?: boolean
  items: CanvasItem[]
  selectedIds: string[]
  tab?: 'refs' | 'materials'
  onTabChange?: (tab: 'refs' | 'materials') => void
  onUploadReference?: () => void
  onCollapse: () => void
  onAddMaterial?: (attachment: ChatAttachment) => void
  onSelectReference: (attachment: ChatAttachment, index: number) => void
}) {
  const [innerTab, setInnerTab] = useState<'refs' | 'materials'>('refs')
  const tab = controlledTab ?? innerTab
  const setTab = (next: 'refs' | 'materials') => {
    setInnerTab(next)
    onTabChange?.(next)
  }
  const id = useId()
  const tabs = ['refs', 'materials'] as const

  return (
    <aside
      className="ref-panel"
      aria-label="参考与我的素材"
      data-testid="reference-panel"
    >
      <div className="ref-panel-hd">
        <div className="ref-panel-tabs" role="tablist" aria-label="画布资料"
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'refs' : event.key === 'End' || tab === 'refs' ? 'materials' : 'refs'
            setTab(next)
            event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
          }}>
          {tabs.map(value => <button key={value} type="button" role="tab" data-tab={value}
            id={`${id}-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}>
            {value === 'refs' ? <>参考 {references.length > 0 && <small className="ref-panel-cnt tnum">{references.length}</small>}</> : '我的素材'}
          </button>)}
        </div>
        <button
          type="button"
          className="ibtn"
          title="收起参考面板"
          aria-label="收起参考面板"
          data-testid="collapse-ref-btn"
          onClick={onCollapse}
        >
          <Icon name="sliders" size={15} />
        </button>
      </div>
      <div className="ref-panel-list" role="tabpanel" aria-labelledby={`${id}-refs`} hidden={tab !== 'refs'} tabIndex={tab === 'refs' ? 0 : -1}>
        {previous && <p className="ref-panel-status">上次引用的图片</p>}
        {onUploadReference && (
          <button type="button" className="ref-upload-card" aria-label="上传参考图" title="上传参考图" onClick={onUploadReference}>
            <span className="ref-upload-box"><Icon name="plus" size={22} /></span>
          </button>
        )}
        {references.map((att, idx) => {
          const canvasMatch = findCanvasItemForReference(att, items)
          const isSelected = Boolean(canvasMatch && selectedIds.includes(canvasMatch.id))
          return (
            <button
              key={`${att.kind}:${att.id}:${att.image.id}`}
              type="button"
              className={'ref-card' + (isSelected ? ' sel' : '')}
              onClick={() => onSelectReference(att, idx)}
              title={canvasMatch ? `在画布中定位「${att.label}」` : `查看大图预览「${att.label}」`}
            >
              <div className="ref-card-img">
                <img src={att.image.thumbUrl ?? att.image.url} alt={att.label} draggable={false} />
                <span className="ref-card-hint">{canvasMatch ? '定位画布' : '预览大图'}</span>
              </div>
              <div className="ref-card-meta">
                <span className="ref-card-kind">{KIND_LABEL[att.kind]}</span>
                <span className="ref-card-label">{att.label}</span>
              </div>
            </button>
          )
        })}
        {!references.length && <p className="ref-panel-status">当前消息暂无参考图</p>}
      </div>
      <div className="ref-panel-list" role="tabpanel" aria-labelledby={`${id}-materials`} hidden={tab !== 'materials'} tabIndex={tab === 'materials' ? 0 : -1}>
        {tab === 'materials' && <MaterialsList onSelect={onAddMaterial} />}
      </div>
    </aside>
  )
}

function MaterialsList({ onSelect }: { onSelect?: (attachment: ChatAttachment) => void }) {
  const { user, loading: checkingSession, requireAuth } = useV2Auth()
  const { data, loading, error, reload } = useLoad(source => source.listMaterials(), [user?.id], Boolean(user))
  if (checkingSession || loading) return <p className="ref-panel-status" role="status">加载中…</p>
  if (!user) return <button type="button" className="ref-panel-status" onClick={() => void requireAuth()}>登录后查看我的素材</button>
  if (error) return <button type="button" className="ref-panel-status" onClick={reload}>素材加载失败，点击重试</button>
  if (!data?.length) return <p className="ref-panel-status">暂无素材</p>
  return data.map(material => <button type="button" className="ref-card" key={material.id} title={`引用「${material.name}」`}
    onClick={() => onSelect?.({ kind: 'material', id: material.id, label: material.name, image: material.image })}>
    <div className="ref-card-img">
      <img src={material.image.thumbUrl ?? material.image.url} alt="" loading="lazy" draggable={false} />
      <span className="ref-card-hint">引用</span>
    </div>
    <div className="ref-card-meta"><span className="ref-card-label">{material.name}</span></div>
  </button>)
}
