import type { FrozenModelPolicy } from './detail-workflow-types'

export interface FrozenPhotoFissionWorkflow {
  schemaVersion: 1
  definitionId: 'photo-fission-general'
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
    inputImageLabels: string[]
    prompt: string
  }[]
  digest: string
}
