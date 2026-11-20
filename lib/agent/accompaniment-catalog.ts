import { z } from 'zod'

/** 自有文字陪衬库；没有商品图片、品牌或销量承诺，不伪装成联网检索结果。 */
export const accompanimentSchema = z.object({
  catalogId: z.string().min(1).max(80),
  source: z.literal('generic-kids-v1'),
  role: z.enum(['bottom', 'shoes']),
  description: z.string().min(1).max(500),
}).strict()
export type GenericAccompaniment = z.infer<typeof accompanimentSchema>
export const GENERIC_KIDS_ACCOMPANIMENTS: readonly GenericAccompaniment[] = [
  { catalogId: 'kids-ivory-trousers', source: 'generic-kids-v1', role: 'bottom', description: '米白色纯色棉质直筒长裤，合体童装比例，无标志、无图案' },
  { catalogId: 'kids-blue-jeans', source: 'generic-kids-v1', role: 'bottom', description: '浅蓝色纯色直筒牛仔长裤，合体童装比例，无破洞、无标志' },
  { catalogId: 'kids-beige-trousers', source: 'generic-kids-v1', role: 'bottom', description: '浅卡其色纯色棉质长裤，合体童装比例，无标志、无图案' },
  { catalogId: 'kids-white-canvas-shoes', source: 'generic-kids-v1', role: 'shoes', description: '白色低帮帆布鞋，适合儿童穿着，无品牌标志' },
  { catalogId: 'kids-brown-flat-shoes', source: 'generic-kids-v1', role: 'shoes', description: '棕色圆头平底小皮鞋，适合儿童穿着，无品牌标志' },
]
