import type { CaseCategory } from './types'

export const CASE_CATEGORY_ORDER_PUBLIC: CaseCategory[] = ['model', 'main', 'detail', 'style', 'retouch', 'fabric']

export const CASE_CATEGORY_LABEL: Record<CaseCategory, string> = {
  model: '模特图',
  main: '主图',
  detail: '详情页',
  style: '款式',
  retouch: '修图',
  fabric: '图案面料',
}
