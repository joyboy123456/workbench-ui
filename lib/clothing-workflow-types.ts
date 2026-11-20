import type { DetailWorkflowNode, FrozenModelPolicy } from './detail-workflow-types'

export interface FrozenClothingWorkflow {
  schemaVersion: 1
  definitionVersion: '2026-11-11-1' | '2026-11-11-2'
  definitionId: string
  sourceCommit: string
  taskId: string
  parentTaskId?: string
  inputAssetIds: string[]
  intentDigest: string
  paramsDigest: string
  vectorComplexity?: 'low'
  vectorAuthorModel?: string
  modelPolicy: FrozenModelPolicy
  nodes: DetailWorkflowNode[]
  digest: string
}
