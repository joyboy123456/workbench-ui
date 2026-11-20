import type { FashionModelId } from './types'
import { GPT_IMAGE_26 } from './openai-image-models'

/** 可公开的表单默认值；服务端策略引用同一份规则，不含供应商或密钥。 */
export const CLOTHING_FIXED_MODELS: Readonly<Record<number, FashionModelId>> = {
  702: 'nano-banana-2', 709: 'nano-banana-2', 80213: 'nano-banana-2',
  80215: 'nano-banana-2', 80216: 'nano-banana-2', 80217: 'nano-banana-2', 80231: 'nano-banana-2',
  80238: 'nano-banana-pro', 80239: 'nano-banana-2', 80240: 'nano-banana-2',
  80245: GPT_IMAGE_26.sunburst,
  80242: 'nano-banana-pro', 80243: GPT_IMAGE_26.sunburst, 80262: 'nano-banana-2',
  80263: 'nano-banana-2', 80264: 'nano-banana-2',
  80301: 'nano-banana-2', 80302: 'nano-banana-pro', 80303: 'nano-banana-pro',
  80304: 'nano-banana-2', 80305: 'nano-banana-2',
  // V2 画布图像操作（任务卡 06）：蒙版类沿用多图参考已验证的 nano-banana-2；
  // 扩图/2K放大沿用 nano-banana-pro（80242 的 4K档同模型，比例与 2K/4K 档位齐全）。
  // 当前 Grsai 未接通 gpt-image-2.6；新非蒙版工具按契约回退 pro。
  80250: 'nano-banana-2', 80251: 'nano-banana-2',
  80252: 'nano-banana-pro', 80253: 'nano-banana-pro', 80254: 'nano-banana-pro',
  80246: 'nano-banana-pro', 80247: 'nano-banana-2', 80248: 'nano-banana-2', 80249: 'nano-banana-pro',
}

export const DETAIL_PAGE_MODEL_RULES = {
  BASE: 'gpt-image-2.5-flare', PRO: 'gpt-image-2.5-sunburst',
  'gpt-image-2': GPT_IMAGE_26.sunburst, 'material-enhanced': 'nano-banana-pro',
} as const

export const TEXTILE_OBLIQUE_MODEL: FashionModelId = GPT_IMAGE_26.sunburst
