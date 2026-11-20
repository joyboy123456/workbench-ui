export type PiRunStep = {
  kind: 'model' | 'skill' | 'tool' | 'submission' | 'confirmation' | 'admission' | 'turn'
  label: string
  startedAt: string
  durationMs: number
  status: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  actionId?: string
  reasonCodes?: string[]
  plan?: { runId: string; revision: number }
}

export interface PiRunTask {
  actionId: string
  taskId?: string
  label: string
  submission: string
  status?: string
  admission: string
  reasonCodes: string[]
  queuedAt?: string
  supplierStartedAt?: string
  finishedAt?: string
  expectedResults: number
  admittedResults: number
}

export interface PiRunDetails {
  runId: string
  steps: PiRunStep[]
  tasks: PiRunTask[]
}
