import { isChatTransportFailure } from './chat-error'
import { snapshotKey } from './snapshot-key'
import type { AssistantMessage, ChatMessage } from './types'

/** A replay changes content/status, never the timestamp of an existing bubble. */
export function mergeChatMessage(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (incoming.role === 'assistant' && !incoming.failure && !/^agent-(error|connection-error)-/.test(incoming.id)
    && messages.some(message => message.role === 'assistant' && isChatTransportFailure(message.failure))) {
    messages = messages.map(message => message.role === 'assistant' && isChatTransportFailure(message.failure)
      ? { ...message, body: '连接已恢复。', failure: undefined, retryable: false } : message)
  }
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
