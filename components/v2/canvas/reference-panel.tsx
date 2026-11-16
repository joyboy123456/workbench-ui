'use client'
import React from 'react'
import type { CanvasItem, ChatAttachment, ChatMessage } from '@/lib/v2/types'
import { Icon } from '../icons'

const KIND_LABEL: Record<ChatAttachment['kind'], string> = {
  product: '商品',
  model: '模特',
  canvas: '@引用',
  material: '素材',
  upload: '上传',
  brand: '品牌',
}

function dedupeAttachments(list: ChatAttachment[]): ChatAttachment[] {
  const seen = new Set<string>()
  const out: ChatAttachment[] = []
  for (const item of list) {
    const key = item.image.id || `${item.kind}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** 提取当前这条消息用到的参考图（含 Q/A 澄清回合沿用原提问的参考图） */
export function extractActiveReferences(messages: ChatMessage[], focusMessageId?: string | null): ChatAttachment[] {
  if (!messages.length) return []
  let endIndex = messages.length - 1
  if (focusMessageId) {
    const idx = messages.findIndex((m) => m.id === focusMessageId)
    if (idx >= 0) endIndex = idx
  }
  for (let i = endIndex; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.role !== 'user') continue
    if (msg.attachments.length > 0) return dedupeAttachments(msg.attachments)
    if (msg.text.startsWith('Q：')) continue
    return []
  }
  return []
}

export function findCanvasItemForReference(attachment: ChatAttachment, items: CanvasItem[]): CanvasItem | undefined {
  return items.find(
    (item) =>
      item.id === attachment.id ||
      item.image.id === attachment.image.id ||
      item.image.url === attachment.image.url ||
      (attachment.kind === 'product' &&
        item.ref.type === 'product' &&
        item.ref.id === attachment.id &&
        item.ref.imageId === attachment.image.id),
  )
}

export function ReferencePanel({
  references,
  items,
  selectedIds,
  hidden,
  onCollapse,
  onSelectReference,
}: {
  references: ChatAttachment[]
  items: CanvasItem[]
  selectedIds: string[]
  hidden?: boolean
  onCollapse: () => void
  onSelectReference: (attachment: ChatAttachment, index: number) => void
}) {
  if (!references.length) return null

  return (
    <aside
      className="ref-panel"
      aria-label="当前消息参考图"
      aria-hidden={hidden || undefined}
      data-testid="reference-panel"
    >
      <div className="ref-panel-hd">
        <span className="ref-panel-title">
          参考
          <small className="ref-panel-cnt tnum">{references.length}</small>
        </span>
        <button
          type="button"
          className="ibtn"
          title="收起参考面板"
          aria-label="收起参考面板"
          data-testid="collapse-ref-btn"
          onClick={onCollapse}
        >
          <Icon name="sidebar-close" size={15} />
        </button>
      </div>
      <div className="ref-panel-list">
        {references.map((att, idx) => {
          const canvasMatch = findCanvasItemForReference(att, items)
          const isSelected = Boolean(canvasMatch && selectedIds.includes(canvasMatch.id))
          const w = Math.max(1, att.image.width || 3)
          const h = Math.max(1, att.image.height || 4)
          return (
            <button
              key={`${att.kind}:${att.id}:${att.image.id}`}
              type="button"
              className={'ref-card' + (isSelected ? ' sel' : '')}
              onClick={() => onSelectReference(att, idx)}
              title={canvasMatch ? `在画布中定位「${att.label}」` : `查看大图预览「${att.label}」`}
            >
              <div className="ref-card-img" style={{ aspectRatio: `${w} / ${h}` }}>
                <img src={att.image.thumbUrl ?? att.image.url} alt={att.label} draggable={false} />
              </div>
              <div className="ref-card-meta">
                <span className="ref-card-kind">{KIND_LABEL[att.kind]}</span>
                <span className="ref-card-label">{att.label}</span>
                <span className="ref-card-hint">{canvasMatch ? '定位画布' : '预览大图'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
