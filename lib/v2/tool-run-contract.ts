import type { AssistantMessage, CanvasItem, Generation, ToolParams } from './types'

/** A run owns stable task/output identities. A transport error never creates a new run. */
export interface ToolRunView {
  id: string
  projectId: string
  toolId: string
  status: 'running' | 'done' | 'failed' | 'unconfirmed'
  items: CanvasItem[]
  message: AssistantMessage
  referencePlan?: string
  droppedReferenceIds?: string[]
  error?: string
  retryAllowed: boolean
  createdAt: string
}
export interface ToolRunInput {
  requestId: string
  projectId: string
  toolId: string
  itemIds: string[]
  params?: ToolParams
}
export interface ToolGenerationRecord extends Generation {
  taskId: string
  runId: string
  assetId: string
}
