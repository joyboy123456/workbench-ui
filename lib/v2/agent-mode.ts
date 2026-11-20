import { z } from 'zod'
import type { AgentMode } from './types'

/** Read old conversations without retaining the old mode in new writes. */
export const agentModeSchema = z.enum(['agent', 'image', 'video', 'ecom-set', 'direct'])
  .transform((mode): AgentMode => mode === 'direct' ? 'image' : mode)

export function normalizeAgentMode(value: unknown): AgentMode {
  const parsed = agentModeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'agent'
}

export function composerModeKey(userId: string | undefined, projectId?: string) {
  return `v2:composer-mode:v1:${encodeURIComponent(userId ?? 'guest')}:${encodeURIComponent(projectId ?? 'new')}`
}
