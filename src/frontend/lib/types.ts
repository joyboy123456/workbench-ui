import { GPT_IMAGE_26, isGptImage26, type GptImage26Model } from './openai-image-models'

export type FeatureType =
  | 'ai-fashion-photo'
  | 'photo-fission'
  | 'pose-fission'
  | 'garment-detail'
  | 'image-generation'
  | 'material-edit'

export const FASHION_OUTPUT_RATIOS = ['1:1', '3:2', '2:3', '3:4', '4:3', '9:16'] as const

export type FashionImageRatio = typeof FASHION_OUTPUT_RATIOS[number] | 'more'

export type PoseResolution = '2k' | '4k'

export type FashionResolution = '1k' | PoseResolution

export type FashionModelId =
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image-preview'
  | 'gpt-image-2'
  | 'wj-gpt-image-2'
  | 'gpt-image-2.5-sunburst'
  | 'gpt-image-2.5-flare'
  | 'gpt-image-2.5'
  | GptImage26Model
  | 'nano-banana-2.1'
  | 'jimeng-seedream-4.6'
  | 'doubao-seedream-4.5'
  | 'doubao-seedream-5.0-lite'
  | 'doubao-seedream-5.0-pro'
  | 'midjourney-v8.1'
  | 'midjourney-niji-7'
  | 'nano-banana-2-lite'
  | 'nano-banana-2'
  | 'wuyin-nano-banana-2'
  | 'nano-banana-pro'

export const FASHION_IMAGE_RATIOS = [
  ...FASHION_OUTPUT_RATIOS.map(id => ({ id, label: id })),
  { id: 'more', label: '更多' },
] satisfies { id: FashionImageRatio; label: string }[]

export const POSE_RESOLUTIONS = [
  { id: '2k', label: '2k' },
  { id: '4k', label: '4k' },
] satisfies { id: PoseResolution; label: string }[]

export const FASHION_RESOLUTIONS = [{ id: '1k', label: '1K' }, ...POSE_RESOLUTIONS] satisfies {
  id: FashionResolution
  label: string
}[]

export type FashionModelProvider = 'laozhang' | 'grsai' | 'wuyin' | 'openai' | 'wujie'

export interface FashionModelOption {
  id: FashionModelId
  label: string
  alias: string
  description: string
  maxInputImages: number
  maxResolutionLabel: '1K' | '2K' | '3K' | '4K'
  selectable?: boolean
  /** 渠道分组，用于模型选择器及各入口的模型白名单。 */
  provider: FashionModelProvider
}

export const FASHION_MODELS: FashionModelOption[] = [
  {
    id: 'wuyin-nano-banana-2', label: '速创 Nano Banana 2', alias: '速创 NB2',
    selectable: false,
    description: '已并入 Nano Banana 2 的多通道路由池，不再单独呈现',
    maxInputImages: 14, maxResolutionLabel: '4K', provider: 'wuyin',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    selectable: false,
    label: 'Nano Banana',
    alias: 'Gemini 3.1 Flash',
    description: '推荐默认。走 Google Gemini / 七牛 Gemini 图像渠道，最多 14 张参考图，支持 4K 出图',
    maxInputImages: 14,
    maxResolutionLabel: '4K',
    provider: 'laozhang',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    alias: 'OpenAI 兼容',
    description: '旧渠道（七牛/老张）已下线，暂不可选；请改用 GPT Image 2.5',
    maxInputImages: 10,
    maxResolutionLabel: '4K',
    selectable: false,
    provider: 'laozhang',
  },
  {
    id: 'gemini-3-pro-image-preview',
    selectable: false,
    label: 'Nano Banana Pro',
    alias: 'Gemini 3 Pro',
    description: 'Google 旗舰画质，thinking 模式，最多 14 张参考图，速度较慢',
    maxInputImages: 14,
    maxResolutionLabel: '4K',
    provider: 'laozhang',
  },
  {
    id: 'jimeng-seedream-4.6',
    label: '即梦 Seedream 4.6',
    alias: '即梦 AI 4.6',
    description: '字节跳动火山引擎图片生成，高质量中文场景理解，支持 4K 出图',
    maxInputImages: 5,
    maxResolutionLabel: '4K',
    selectable: false,
    provider: 'laozhang',
  },
  {
    id: 'doubao-seedream-4.5',
    label: '豆包 Seedream 4.5',
    alias: '豆包 AI 4.5',
    description: '字节跳动火山引擎豆包图片生成，高质量中文场景理解，支持 4K 出图',
    maxInputImages: 5,
    maxResolutionLabel: '4K',
    provider: 'laozhang',
  },
  {
    id: 'doubao-seedream-5.0-lite',
    label: 'Seedream 5.0 Lite',
    alias: 'Seedream 5.0 Lite',
    description: '支持 2K/4K 高清输出与最多 14 张参考图，适合高性价比中文场景生成。',
    maxInputImages: 14,
    maxResolutionLabel: '4K',
    provider: 'wujie',
  },
  {
    id: 'doubao-seedream-5.0-pro',
    label: 'Seedream 5.0 Pro',
    alias: 'Seedream 5.0 Pro',
    description: '豆包 Seedream 5.0 专业版，支持 1K/2K 精细构图与最多 10 张参考图。',
    maxInputImages: 10,
    maxResolutionLabel: '2K',
    provider: 'wujie',
  },
  {
    id: 'nano-banana-2-lite',
    label: 'Nano Banana 2 Lite',
    alias: 'NB2 Lite',
    description: '支持1K，可使用多张参考图。',
    maxInputImages: 14,
    maxResolutionLabel: '1K',
    provider: 'grsai',
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    alias: 'NB2',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxInputImages: 14,
    maxResolutionLabel: '4K',
    provider: 'grsai',
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    alias: 'NB Pro',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxInputImages: 14,
    maxResolutionLabel: '4K',
    provider: 'grsai',
  },
  {
    id: 'nano-banana-2.1', label: 'Nano Banana 2.1', alias: 'NB 2.1',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxInputImages: 14, maxResolutionLabel: '4K', provider: 'grsai',
  },
  {
    id: 'gpt-image-2.5', label: 'GPT Image 2.5 标准版', alias: 'GPT 2.5 标准',
    description: '标准版，仅支持1K和自动画质。',
    maxInputImages: 10, maxResolutionLabel: '1K', provider: 'grsai',
  },
  {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    alias: 'GPT 2.5 Sunburst',
    description: '支持1K/2K/4K；低、中、高、超高、最高画质。',
    maxInputImages: 10,
    maxResolutionLabel: '4K',
    provider: 'grsai',
  },
  {
    id: GPT_IMAGE_26.sunburst,
    label: 'GPT Image 2.6 Sunburst',
    alias: 'GPT 2.6 Sunburst',
    description: '适合细节丰富的商拍和精细编辑，支持 4K 和最高渲染画质。',
    maxInputImages: 10,
    maxResolutionLabel: '4K',
    provider: 'openai',
  },
  {
    id: GPT_IMAGE_26.flare,
    label: 'GPT Image 2.6 Flare',
    alias: 'GPT 2.6 Flare',
    description: '适合快速出图和反复调整，支持 4K 和最高渲染画质。',
    maxInputImages: 10,
    maxResolutionLabel: '4K',
    provider: 'openai',
  },
  {
    id: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    alias: 'GPT 2.5 Flare',
    description: '支持1K/2K/4K；低、中、高画质。',
    maxInputImages: 10,
    maxResolutionLabel: '4K',
    provider: 'grsai',
  },
  {
    id: 'wj-gpt-image-2',
    label: 'GPT Image 2',
    alias: 'GPT Image 2',
    description: '支持多达 16 张参考图与低/中/自动质量档，适合多图排版与电商编辑。',
    maxInputImages: 16,
    maxResolutionLabel: '2K',
    provider: 'wujie',
  },
  {
    id: 'midjourney-v8.1',
    label: 'Midjourney V8.1',
    alias: 'MJ V8.1',
    description: '通用写实与商业艺术摄影风格，擅长高级质感、光影氛围与创意大片。',
    maxInputImages: 5,
    maxResolutionLabel: '2K',
    provider: 'wujie',
  },
  {
    id: 'midjourney-niji-7',
    label: 'Midjourney Niji 7',
    alias: 'Niji 7',
    description: '二次元、插画与潮玩视觉风格，色彩张力强，适合品牌插画与风格化企划。',
    maxInputImages: 5,
    maxResolutionLabel: '2K',
    provider: 'wujie',
  },
]

export function isAgentImageModel(model: FashionModelOption): boolean {
  return model.provider === 'grsai' || model.provider === 'wujie' || (model.provider === 'openai' && isGptImage26(model.id))
}

export const SELECTABLE_FASHION_MODELS: FashionModelOption[] =
  FASHION_MODELS.filter((option) => option.selectable !== false)

export const DEFAULT_FASHION_MODEL: FashionModelId = 'nano-banana-2'
