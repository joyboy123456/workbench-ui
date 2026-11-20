import type { DetailTemplateVersion } from '@/lib/product-detail'

export interface ProductDetailScreen {
  screenIndex: number
  screenTitle: string
  referenceType: 'single_product' | 'model_product'
  /** 全部原始上传素材中的下标；发送子集时必须重新编号提示词。 */
  referenceIndexes: number[]
  positivePrompt: string
  copy?: string[]
  negativePrompt: string
}

export type ProductDetailScreenStatus = 'not-started' | 'sending' | 'failed' | 'unknown' | 'completed'

export const DETAIL_SEAM_LAYOUT = {
  background: '#F6F1E9',
  safeZonePercent: 8,
  overlapAt1024: 24,
} as const

export interface ProductDetailState {
  version: 1
  templateVersion?: DetailTemplateVersion
  plannerModel?: string
  plannerUsage?: { input_tokens: number; output_tokens: number }
  retryRevision?: number
  lastRetryRequestId?: string
  report?: string
  screens?: ProductDetailScreen[]
  screenStates?: Record<string, ProductDetailScreenStatus>
}
