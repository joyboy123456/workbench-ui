export interface FrozenModelPolicy {
  id: string
  version: string
  model: string
  providerScope?: 'official-openai' | 'grsai'
  bucket: number
}

export interface DetailWorkflowNode {
  id: string
  op: 'image-edit'
  inputAssetIds: string[]
  inputImageLabels: string[]
  prompt: string
}

export interface FrozenDetailWorkflow {
  schemaVersion: 1
  definitionId: 'garment-detail'
  definitionVersion: string
  sourceCommit: string
  inputAssetIds: string[]
  intentDigest: string
  modelPolicy: FrozenModelPolicy
  nodes: DetailWorkflowNode[]
  digest: string
}
