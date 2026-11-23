import type { AssistantMessage, CanvasItem, ChatMessage } from './types'

export interface AgentChatLifecycle {
  turnDelayed?: boolean
  receipt: 'none' | 'not_found' | 'accepted' | 'settled'
  turn: 'idle' | 'running' | 'waiting_input' | 'stopping' | 'completed' | 'stopped' | 'failed' | 'interrupted'
  delivery: 'none' | 'delivery_pending' | 'verifying' | 'delivered' | 'partial' | 'withheld'
}

export type AgentChatConnection = 'snapshot' | 'connected' | 'reconnecting' | 'unavailable'

type AgentMessageReceipt = { clientMessageId: string; state: 'accepted' | 'settled' | 'not_found' }

export interface AgentChatSnapshot {
  lifecycle?: AgentChatLifecycle
  connection?: AgentChatConnection
  sessionId?: string
  messages: ChatMessage[]
  items: CanvasItem[]
  receipts: AgentMessageReceipt[]
  active: boolean
  activeRunId?: string
}

export type AgentChatState = Pick<AgentChatSnapshot, 'active' | 'activeRunId' | 'lifecycle' | 'connection'> & { ready?: boolean; receipts?: AgentMessageReceipt[]; error?: string; failure?: import('./chat-error').ChatError }

export function chatFailure(id: string, message: string, createdAt = new Date().toISOString(), failure?: import('./chat-error').ChatError): AssistantMessage {
  return { id, role: 'assistant', createdAt, body: message, steps: [], results: [], ...(failure ? { failure, retryable: failure.retryable } : {}) }
}
