import type { CanvasItem, ChatAttachment, ChatMessage } from './types'

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
export function extractActiveReferences(messages: ChatMessage[], focusMessageId?: string | null, includePrevious = false): ChatAttachment[] {
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
    if (msg.appliedReferences?.length) return dedupeAttachments(msg.appliedReferences)
    if (!includePrevious && (msg.appliedReferences || !msg.text.startsWith('Q：'))) return []
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
