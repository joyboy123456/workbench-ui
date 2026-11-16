/** 生图模型与规格预设（从主仓库抽出的静态副本，只用于界面展示）。 */
export type ModelSpeedTag = '快' | '标准' | '精细'

export interface StudioModelPreset {
  id: string
  label: string
  description: string
  maxResolutionLabel: string
  speedTag: ModelSpeedTag
  strengthTags: string[]
  supportedRatios?: string[]
}

export const STUDIO_GENERATION_MODELS: StudioModelPreset[] = [
  {
    id: 'nano-banana-2-lite',
    label: 'Nano Banana 2 Lite',
    description: '支持1K，可使用多张参考图。',
    maxResolutionLabel: '1K',
    speedTag: '快',
    strengthTags: ['局部编辑'],
    supportedRatios: ['1:1', '3:4', '4:3'],
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxResolutionLabel: '4K',
    speedTag: '标准',
    strengthTags: ['4K', '局部编辑'],
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxResolutionLabel: '4K',
    speedTag: '精细',
    strengthTags: ['4K', '文字', '局部编辑'],
  },
  {
    id: 'nano-banana-2.1',
    label: 'Nano Banana 2.1',
    description: '支持1K、2K和4K，可使用多张参考图。',
    maxResolutionLabel: '4K',
    speedTag: '标准',
    strengthTags: ['4K', '文字'],
  },
  {
    id: 'gpt-image-2.5',
    label: 'GPT Image 2.5 标准版',
    description: '标准版，仅支持1K和自动画质。',
    maxResolutionLabel: '1K',
    speedTag: '快',
    strengthTags: ['文字'],
    supportedRatios: ['1:1', '3:2', '2:3', '3:4', '4:3'],
  },
  {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    description: '支持1K/2K/4K；低、中、高、超高、最高画质。',
    maxResolutionLabel: '4K',
    speedTag: '精细',
    strengthTags: ['文字', '4K'],
  },
  {
    id: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    description: '支持1K/2K/4K；低、中、高画质。',
    maxResolutionLabel: '4K',
    speedTag: '标准',
    strengthTags: ['4K', '局部编辑'],
  },
]

export const STUDIO_DEFAULT_MODEL = 'nano-banana-2'

export const FASHION_IMAGE_RATIOS = [
  ...(['1:1', '3:2', '2:3', '3:4', '4:3', '9:16'] as const).map(id => ({ id, label: id as string })),
  { id: 'more', label: '更多' },
]

export const FASHION_RESOLUTIONS = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2k' },
  { id: '4k', label: '4k' },
]
