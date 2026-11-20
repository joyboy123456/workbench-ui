import type { ComposerGeneration } from './composer-options'
import type { AgentBetaMessageStatus } from '@/lib/agent-beta/types'
import type { AssistantMessage, CanvasItem, ChatAttachment, ChatMessage, AgentMode, AppliedProjectReference } from './types'

/** The transport sends asset identities, never trusted client URLs. */
export interface AgentChatRequest {
  clientMessageId: string
  text: string
  mode: AgentMode
  caseId?: string
  generation?: ComposerGeneration
  attachments: Array<Pick<ChatAttachment, 'kind' | 'id' | 'label'> & { assetId: string }>
}
export const followUpIntents = ['retry', 'continue', 'variant', 'advance', 'status', 'clarify'] as const

export interface AgentChatSubmission {
  clientMessageId: string
  text: string
  caseId?: string
  /** 重试时对话显示本轮短句，生成记录继续使用原需求 text。 */
  retryMessageText?: string
  followUp?: { intent: typeof followUpIntents[number]; sourceMessageId: string; text: string; reply?: string }
  /** 执行确认时显示的用户动作。text 保留实际生成提示词。 */
  confirmationMessageText?: string
  mode: AgentMode
  generation?: ComposerGeneration
  attachments: ChatAttachment[]
  /** 包含自动项目锁定；与用户消息里只展示的 attachments 分开保存。 */
  appliedReferences?: Array<ChatAttachment & Pick<AppliedProjectReference, 'referenceId' | 'role' | 'note' | 'explicit'>>
  referencePlan?: string
  droppedReferenceIds?: string[]
  createdAt: string
  error?: string
  failure?: import('./chat-error').ChatError
}
export interface AgentChatLifecycle {
  turnDelayed?: boolean
  receipt: 'none' | 'not_found' | 'accepted' | 'settled'
  turn: 'idle' | 'running' | 'waiting_input' | 'stopping' | 'completed' | 'stopped' | 'failed' | 'interrupted'
  delivery: 'none' | 'delivery_pending' | 'verifying' | 'delivered' | 'partial' | 'withheld'
}
export type AgentChatConnection = 'snapshot' | 'connected' | 'reconnecting' | 'unavailable'
export interface AgentChatSnapshot {
  lifecycle?: AgentChatLifecycle
  connection?: AgentChatConnection
  /** Ephemeral transport checkpoint; final messages/receipts remain authoritative. */
  stream?: import('@/lib/agent/chat-stream').ChatStreamCheckpoint
  sessionId?: string
  messages: ChatMessage[]
  items: CanvasItem[]
  receipts: AgentBetaMessageStatus[]
  active: boolean
  activeRunId?: string
}
export type AgentChatState = Pick<AgentChatSnapshot, 'active' | 'activeRunId' | 'lifecycle' | 'connection'> & { ready?: boolean; receipts?: AgentBetaMessageStatus[]; error?: string; failure?: import('./chat-error').ChatError }

export const emptyAgentImage = { id: 'agent-placeholder', url: '/v2-agent-placeholder.svg', width: 768, height: 1024 }
export function chatFailure(id: string, message: string, createdAt = new Date().toISOString(), failure?: import('./chat-error').ChatError): AssistantMessage {
  return { id, role: 'assistant', createdAt, body: message, steps: [], results: [], ...(failure ? { failure, retryable: failure.retryable } : {}) }
}
