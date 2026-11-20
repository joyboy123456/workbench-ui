import { z } from 'zod'

export const genderLabels = { female: '女', male: '男' } as const
export const ageGroupLabels = {
  baby: '婴儿', toddler: '小童', kid: '中大童', older_kid: '大童',
  teen: '青少年', young_adult: '青年', middle_aged: '中年', senior: '老年',
} as const
export const ethnicities = ['中国', '南亚', '白人', '拉丁裔', '非裔', '韩国', '日本', '中东'] as const
export const hairColors = ['黑', '棕', '金', '白', '灰', '红'] as const
export const modelFiltersSchema = z.object({
  gender: z.enum(['female', 'male']).optional(),
  age_group: z.enum(['baby', 'toddler', 'kid', 'older_kid', 'teen', 'young_adult', 'middle_aged', 'senior']).optional(),
  ethnicity: z.enum(ethnicities).optional(),
  hair_color: z.enum(hairColors).optional(),
}).strict()
export type ModelFilters = z.infer<typeof modelFiltersSchema>
export interface PublicModelPreset {
  id: string
  code: string
  display_name: string
  gender: NonNullable<ModelFilters['gender']>
  age_group: NonNullable<ModelFilters['age_group']>
  age_years: number
  ethnicity: typeof ethnicities[number]
  hair_color: typeof hairColors[number]
  width: number
  height: number
  thumbnailUrl: string
  imageUrl: string
}

export { PUBLIC_MODEL_PREFIX, publicModelReferenceId, publicModelImageUrl } from './model-ids'
