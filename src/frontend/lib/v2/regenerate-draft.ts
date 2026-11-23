import type { AgentMode, ToolParams } from './types'

/** An explicit, one-time input command, never a generation submission. */
export interface ComposerPrefill { id: string; text: string; toolId?: string; caseId?: string; mode?: AgentMode; generation?: Partial<import('./composer-options').ComposerGeneration>; firstFrame?: import('./types').ChatAttachment; videoImage?: import('./types').ChatAttachment }

export interface ToolRegenerationDraft {
  kind?: 'tool'
  toolId: string
  itemId: string
  params?: ToolParams
  previewOnly?: boolean
  anchorId?: string
  notice?: string
}

/** Reuse the canvas's existing autoTool slot; no second page state machine. */
export type CanvasRegenerationDraft = ToolRegenerationDraft | { kind: 'chat'; prefill: ComposerPrefill }
