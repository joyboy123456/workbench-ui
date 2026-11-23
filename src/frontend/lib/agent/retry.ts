import { z } from 'zod'
const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/)
export const agentRetryTargetSchema = z.object({ kind: z.enum(['phase1', 'image']), runId: id, taskId: id, slotId: id, expectedAttemptNumber: z.number().int().positive() }).strict()
export type AgentRetryTarget = z.infer<typeof agentRetryTargetSchema>
export interface AgentImageOutputSlot {
  slotId: string
  slotIndex: number
  attemptNumber: number
  state: 'running' | 'verifying' | 'unknown' | 'failed' | 'admitted'
  retryable: boolean
  assetId?: string
}
