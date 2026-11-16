import type { ComposerGeneration } from './composer-options'
/** 后端消息回执（前端仓库只做展示，结构保持宽松）。 */
export interface AgentMessageReceipt { clientMessageId: string; state: string; [key: string]: unknown }
import type { AssistantMessage, CanvasItem, ChatAttachment, ChatMessage, AgentMode } from './types'

/** The transport sends asset identities, never trusted client URLs. */
export interface AgentChatRequest {
  clientMessageId: string
  text: string
  mode: AgentMode
  generation?: ComposerGeneration
  attachments: Array<Pick<ChatAttachment, 'kind' | 'id' | 'label'> & { assetId: string }>
}
export interface AgentChatSubmission {
  clientMessageId: string
  text: string
  mode: AgentMode
  generation?: ComposerGeneration
  attachments: ChatAttachment[]
  createdAt: string
  error?: string
}
export interface AgentChatSnapshot {
  sessionId?: string
  messages: ChatMessage[]
  items: CanvasItem[]
  receipts: AgentMessageReceipt[]
  active: boolean
  activeRunId?: string
}
export type AgentChatState = Pick<AgentChatSnapshot, 'active' | 'activeRunId'>

export const emptyAgentImage = { id: 'agent-placeholder', url: '/v2-agent-placeholder.svg', width: 768, height: 1024 }
export function chatFailure(id: string, message: string, createdAt = new Date().toISOString()): AssistantMessage {
  return { id, role: 'assistant', createdAt, body: message, steps: [], results: [] }
}
