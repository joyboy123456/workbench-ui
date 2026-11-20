import type { FrozenModelPolicy } from './detail-workflow-types'

export interface FrozenBatchClothingWorkflow {
  schemaVersion: 1
  definitionId: 'batch-clothing-row'
  definitionVersion: string
  templateVersion: string
  sourceCommit: string
  taskId: string
  parentTaskId?: string
  inputAssetIds: string[]
  intentDigest: string
  paramsDigest: string
  modelPolicy: FrozenModelPolicy
  nodes: { id: 'result_1'; op: 'image-edit'; inputAssetIds: string[]; inputImageLabels: string[]; prompt: string }[]
  digest: string
}
