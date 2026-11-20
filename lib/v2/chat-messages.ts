import { snapshotKey } from './snapshot-key'
import type { AssistantMessage, ChatMessage } from './types'

/** A replay changes content/status, never the timestamp of an existing bubble. */
export function mergeChatMessage(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const existing = messages.find(message => message.id === incoming.id)
  if (!existing) return [...messages, incoming]
  const next = { ...incoming, createdAt: existing.createdAt }
  if (snapshotKey(existing) === snapshotKey(next)) return messages
  return messages.map(message => message.id === next.id ? next : message)
}

export function patchChatMessage(messages: ChatMessage[], id: string, patch: Partial<AssistantMessage>): ChatMessage[] {
  const existing = messages.find(message => message.id === id)
  if (existing?.role !== 'assistant') return messages
  return mergeChatMessage(messages, { ...existing, ...patch, id: existing.id })
}
