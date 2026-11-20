import { DETAIL_PAGE_MODEL_RULES } from './clothing-model-rules'
/** 详情页的表单契约；实际生成模板仅在服务端。 */
export const DETAIL_CATEGORIES = ['上衣', '裤子', '裙子', '套装', '家纺', '丝巾'] as const
export const DETAIL_MODELS = ['BASE', 'PRO', 'gpt-image-2', 'material-enhanced'] as const
export type DetailModel = typeof DETAIL_MODELS[number]
export const DETAIL_SEAM_TEMPLATE_VERSION = 4
export type DetailTemplateVersion = 2 | 3 | typeof DETAIL_SEAM_TEMPLATE_VERSION
export const DEFAULT_DETAIL_SELLING_POINTS = '垂感好|不起球|四季可穿'
export const DETAIL_MAX_PRODUCT_IMAGES = 6
export const DETAIL_MAX_SCREENS = 10
export const DETAIL_MODEL_IDS = DETAIL_PAGE_MODEL_RULES

export function detailText(value: unknown, label: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new Error(label + '格式无效')
  if ([...value].length > 200) throw new Error(label + '最多200字')
  return value.replace(/[\r\n"'“”‘’{}]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function detailScreenCount(value: unknown = 3): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > DETAIL_MAX_SCREENS) {
    throw new Error(`详情页屏数必须为1～${DETAIL_MAX_SCREENS}的整数`)
  }
  return value
}
