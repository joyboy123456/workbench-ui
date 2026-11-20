import type { FrozenModelPolicy } from './detail-workflow-types'

export interface FrozenPoseFissionWorkflow {
  schemaVersion: 1
  definitionId: 'pose-fission'
  definitionVersion: string
  templateVersion: string
  sourceCommit: string
  taskId: string
  inputAssetIds: string[]
  intentDigest: string
  paramsDigest: string
  modelPolicy: FrozenModelPolicy
  nodes: {
    id: string
    op: 'image-edit'
    inputAssetIds: string[]
    poseReference: { id: string; url: string; assetId?: string }
    inputImageLabels: string[]
    prompt: string
  }[]
  digest: string
}
