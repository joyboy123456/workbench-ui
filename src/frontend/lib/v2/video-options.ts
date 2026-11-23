import { z } from 'zod'
import type { ComposerGeneration } from './composer-options'

/**
 * 目录保留历史任务的模型规格，当前可用模型由 selectable 控制。
 */
export const VIDEO_MODEL = 'grok-imagine-video'
export const VIDEO_MODEL_NAME = 'Grok Imagine Video'
export const VIDEO_MODEL_UNAVAILABLE_MESSAGE = '所选视频模型已下架，请选择其他视频模型'
/** Grok Web 参考图生视频（mediaGenInput.referenceToVideo）的上限：最多 7 张、最长 10 秒、最高 720p。 */
export const GROK_MAX_REFERENCE_IMAGES = 7
export const GROK_REFERENCE_MAX_DURATION = 10

export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '3:4', '4:3'] as const
export const WUJIE_VIDEO_RATIOS = ['16:9', '9:16', '1:1', '3:4', '4:3', '21:9'] as const
export const ALL_VIDEO_RATIOS = WUJIE_VIDEO_RATIOS
export const VIDEO_RATIO_CHOICES = ['auto', ...VIDEO_RATIOS] as const
export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const
export const ALL_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p', '480P', '768P', '2K'] as const
export const VIDEO_DURATIONS = [6, 10, 15] as const

export type VideoRatio = (typeof ALL_VIDEO_RATIOS)[number]
export type VideoResolution = (typeof ALL_VIDEO_RESOLUTIONS)[number]

export const VIDEO_IMAGE_MODES = ['reference', 'frames'] as const
export type VideoImageMode = (typeof VIDEO_IMAGE_MODES)[number]

export interface VideoModelSpec {
  maxReferenceImages: number
  /** 首尾帧模式可用图片数；缺省 2（首帧 + 尾帧）。 */
  maxFrameImages?: number
  locksFrameRatio?: boolean
  id:
    | typeof VIDEO_MODEL
    | 'wj-seedance-2.5'
    | 'wj-seedance-2.0'
    | 'wj-seedance-2.0-fast'
    | 'wj-seedance-2.0-mini'
    | 'wj-minimax-h3'
    | 'wj-minimax-h3-max'
  name: string
  description: string
  provider: 'wujie' | 'grok'
  recommended?: boolean
  ratios: readonly VideoRatio[]
  resolutions: readonly VideoResolution[]
  defaultResolution: VideoResolution
  durations: readonly number[]
  minDuration: number
  maxDuration: number
  defaultDuration: number
  supportsAudio?: boolean
  requiresPrompt?: boolean
  selectable?: boolean
}

export const VIDEO_MODELS: readonly VideoModelSpec[] = [
  {
    id: 'wj-seedance-2.5',
    maxReferenceImages: 30,
    locksFrameRatio: true,
    name: 'Seedance 2.5',
    selectable: false,
    description: '旗舰音画一体视频，支持最长 30 秒与 1080P 直出。',
    provider: 'wujie',
    recommended: true,
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    durations: [5, 10, 15, 30],
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 5,
    supportsAudio: true,
  },
  {
    id: 'wj-seedance-2.0',
    maxReferenceImages: 9,
    name: 'Seedance 2.0',
    selectable: false,
    description: '均衡高清视频生成，支持音频同步与 1080P 输出。',
    provider: 'wujie',
    recommended: true,
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    durations: [5, 10, 15],
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
    supportsAudio: true,
  },
  {
    id: 'wj-seedance-2.0-fast',
    maxReferenceImages: 9,
    name: 'Seedance 2.0 Fast',
    selectable: false,
    description: '高速版音画生成，适合电商镜头快速预览与迭代。',
    provider: 'wujie',
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    durations: [5, 10, 15],
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
    supportsAudio: true,
  },
  {
    id: 'wj-seedance-2.0-mini',
    maxReferenceImages: 9,
    name: 'Seedance 2.0 Mini',
    selectable: false,
    description: '轻量高性价比版本，支持首帧驱动与自然运镜。',
    provider: 'wujie',
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    durations: [5, 10, 15],
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
    supportsAudio: true,
  },
  {
    id: 'wj-minimax-h3',
    maxReferenceImages: 5,
    locksFrameRatio: true,
    name: 'MiniMax H3',
    selectable: false,
    description: '海螺 H3 视频模型，支持 768P / 2K 超清画质（需填写提示词）。',
    provider: 'wujie',
    recommended: true,
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['768P', '2K'],
    defaultResolution: '768P',
    durations: [5, 10, 15],
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 5,
    requiresPrompt: true,
  },
  {
    id: 'wj-minimax-h3-max',
    maxReferenceImages: 5,
    locksFrameRatio: true,
    name: 'MiniMax H3 Max',
    selectable: false,
    description: '海螺 H3 Max 旗舰版，擅长复杂人物动作与电影感调度（需填写提示词）。',
    provider: 'wujie',
    ratios: WUJIE_VIDEO_RATIOS,
    resolutions: ['480P', '768P'],
    defaultResolution: '768P',
    durations: [5, 10, 15],
    minDuration: 5,
    maxDuration: 15,
    defaultDuration: 5,
    requiresPrompt: true,
  },
  {
    id: VIDEO_MODEL,
    maxReferenceImages: GROK_MAX_REFERENCE_IMAGES,
    maxFrameImages: 1,
    name: VIDEO_MODEL_NAME,
    description: 'Grok 视频直出，支持文生、首帧图生，以及最多 7 张参考图（参考图模式 720p、最长 10 秒）。',
    provider: 'grok',
    recommended: true,
    ratios: VIDEO_RATIOS,
    resolutions: VIDEO_RESOLUTIONS,
    defaultResolution: '720p',
    durations: VIDEO_DURATIONS,
    minDuration: 6,
    maxDuration: 15,
    defaultDuration: 6,
  },
]

/** 可用于新视频任务的模型。 */
export const SELECTABLE_VIDEO_MODELS: readonly VideoModelSpec[] = VIDEO_MODELS.filter(model => model.selectable !== false)

const VIDEO_MODEL_IDS = [
  VIDEO_MODEL,
  'wj-seedance-2.5',
  'wj-seedance-2.0',
  'wj-seedance-2.0-fast',
  'wj-seedance-2.0-mini',
  'wj-minimax-h3',
  'wj-minimax-h3-max',
] as const

export type VideoModelId = (typeof VIDEO_MODEL_IDS)[number]

export function videoModelSpec(modelId?: string): VideoModelSpec | undefined {
  return VIDEO_MODELS.find(item => item.id === modelId)
}

export function isVideoModelSelectable(modelId?: string): boolean {
  return SELECTABLE_VIDEO_MODELS.some(item => item.id === modelId)
}

export function videoModelName(modelId?: string): string {
  return videoModelSpec(modelId)?.name ?? VIDEO_MODEL_NAME
}

/** Grok 渠道专用严格 schema（仅允许 grok-imagine-video 及 6/10/15s、720p/1080p）。 */
export const grokVideoGenerationSchema = z.object({
  modelId: z.literal(VIDEO_MODEL),
  imageMode: z.enum(VIDEO_IMAGE_MODES).optional(),
  ratio: z.enum(VIDEO_RATIO_CHOICES),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  count: z.literal(1),
  duration: z.union([z.literal(6), z.literal(10), z.literal(15)]),
}).strict().superRefine((val, ctx) => {
  const issue = grokReferenceIssue(val)
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message })
})

/** Grok 参考图模式的额外限制（与 grok2api Web 通道一致）。 */
function grokReferenceIssue(val: { imageMode?: VideoImageMode; duration: number; resolution: string }) {
  if (val.imageMode !== 'reference') return undefined
  if (val.duration > GROK_REFERENCE_MAX_DURATION) return { path: 'duration', message: `Grok 参考图模式最长 ${GROK_REFERENCE_MAX_DURATION} 秒` }
  if (val.resolution === '1080p') return { path: 'resolution', message: 'Grok 参考图模式最高 720p' }
  return undefined
}

/** 参数面板可选的清晰度与时长（Grok 参考图模式只给 ≤10 秒、≤720p）。 */
export function videoChoices(generation: Pick<VideoGeneration, 'modelId' | 'imageMode'>) {
  const spec = videoModelSpec(generation.modelId)
  const resolutions: readonly VideoResolution[] = spec?.resolutions ?? VIDEO_RESOLUTIONS
  const durations: readonly number[] = spec?.durations ?? VIDEO_DURATIONS
  if (spec?.provider !== 'grok' || generation.imageMode !== 'reference') return { resolutions, durations }
  return {
    resolutions: resolutions.filter(item => item !== '1080p'),
    durations: durations.filter(item => item <= GROK_REFERENCE_MAX_DURATION),
  }
}

/** 切到 Grok 参考图模式时把时长、清晰度收进可用范围，其余模型原样返回。 */
export function fitVideoImageMode(generation: VideoGeneration): VideoGeneration {
  if (videoModelSpec(generation.modelId)?.provider !== 'grok' || generation.imageMode !== 'reference') return generation
  return {
    ...generation,
    duration: Math.min(generation.duration, GROK_REFERENCE_MAX_DURATION),
    resolution: generation.resolution === '1080p' ? '720p' : generation.resolution,
  }
}

/** 全局视频参数 schema：按所选模型严格校验比例、清晰度与时长范围。 */
export const videoGenerationSchema = z.object({
  modelId: z.enum(VIDEO_MODEL_IDS),
  imageMode: z.enum(VIDEO_IMAGE_MODES).optional(),
  ratio: z.enum(['auto', ...ALL_VIDEO_RATIOS]),
  resolution: z.enum(ALL_VIDEO_RESOLUTIONS),
  count: z.literal(1),
  duration: z.number().int().min(4).max(30),
}).strict().superRefine((val, ctx) => {
  const spec = videoModelSpec(val.modelId)
  if (!spec) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['modelId'], message: '不支持的视频模型' })
    return
  }
  if (val.ratio !== 'auto' && !spec.ratios.includes(val.ratio)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ratio'], message: `${spec.name} 不支持比例 ${val.ratio}` })
  }
  if (!spec.resolutions.includes(val.resolution)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resolution'], message: `${spec.name} 不支持清晰度 ${val.resolution}` })
  }
  if (spec.provider === 'grok') {
    const issue = grokReferenceIssue(val)
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message })
    if (!spec.durations.includes(val.duration)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: `${spec.name} 仅支持 6/10/15 秒` })
    }
  } else if (val.duration < spec.minDuration || val.duration > spec.maxDuration) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['duration'], message: `${spec.name} 时长范围 ${spec.minDuration}–${spec.maxDuration} 秒` })
  }
})

export type VideoGeneration = z.infer<typeof videoGenerationSchema>

export const defaultVideoGeneration: VideoGeneration = {
  modelId: VIDEO_MODEL,
  ratio: 'auto',
  resolution: '720p',
  count: 1,
  duration: 6,
}

/** 宽容读取（本地偏好等来源的 unknown JSON），非法或跨模型切换时自动落回该模型的合法规格。 */
export function normalizeVideoGeneration(value?: unknown, fallbackModelId: VideoModelId = VIDEO_MODEL): VideoGeneration {
  const source = value && typeof value === 'object' ? value as Partial<ComposerGeneration> : undefined
  const spec = videoModelSpec(typeof source?.modelId === 'string' ? source.modelId : undefined)
    ?? videoModelSpec(fallbackModelId)
    ?? VIDEO_MODELS[0]
  const ratio = spec.ratios.includes(source?.ratio as VideoRatio)
    ? (source!.ratio as VideoRatio)
    : 'auto'
  const rawRes = typeof source?.resolution === 'string' ? source.resolution : ''
  const matchedRes = spec.resolutions.find(item => item === rawRes)
    ?? spec.resolutions.find(item => item.toLowerCase() === rawRes.toLowerCase())
    ?? spec.defaultResolution
  const rawDuration = typeof source?.duration === 'number' && Number.isInteger(source.duration) ? source.duration : undefined
  let duration = spec.defaultDuration
  if (rawDuration !== undefined) {
    if (spec.durations.includes(rawDuration)) {
      duration = rawDuration
    } else if (spec.provider === 'wujie' && rawDuration >= spec.minDuration && rawDuration <= spec.maxDuration) {
      duration = rawDuration
    }
  }
  return {
    modelId: spec.id,
    ...(source?.imageMode === 'frames' || (source?.imageMode === 'reference' && spec.maxReferenceImages) ? { imageMode: source.imageMode } : {}),
    ratio,
    resolution: matchedRes,
    count: 1,
    duration,
  }
}

/** 恢复草稿或偏好时，把已下架的模型切换为可选模型。 */
export function normalizeSelectableVideoGeneration(value?: unknown): VideoGeneration {
  const normalized = normalizeVideoGeneration(value)
  return isVideoModelSelectable(normalized.modelId)
    ? normalized
    : normalizeVideoGeneration({ ...normalized, modelId: VIDEO_MODEL })
}

export interface VideoMedia { url: string; duration: number; width: number; height: number }
export const videoMediaSchema = z.object({
  url: z.string().min(1).max(4096).refine(value => /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value), '视频需要持久化地址'),
  duration: z.number().positive().max(600), width: z.number().positive(), height: z.number().positive(),
}).strict()

/** 首帧存在时匹配最接近原图宽高比的当前模型合法比例。 */
export function closestVideoRatio(width: number, height: number, modelId?: string): VideoRatio {
  const candidates = videoModelSpec(modelId)?.ratios ?? VIDEO_RATIOS
  if (!(width > 0 && height > 0)) return candidates[0] ?? '16:9'
  const target = width / height
  let best: VideoRatio = candidates[0] ?? '16:9'
  let minDiff = Infinity
  for (const candidate of candidates) {
    const [w, h] = candidate.split(':').map(Number)
    const diff = Math.abs(Math.log((w / h) / target))
    if (diff < minDiff) { minDiff = diff; best = candidate }
  }
  return best
}

function resolutionShortEdge(resolution: VideoResolution): number {
  switch (resolution) {
  case '480p':
  case '480P':
    return 480
  case '768P':
    return 768
  case '1080p':
    return 1080
  case '2K':
    return 1440
  case '720p':
  default:
    return 720
  }
}

type VideoRatioParams = Pick<VideoGeneration, 'ratio' | 'imageMode'> & { modelId?: string }

export function videoImageLimit(modelId: string, mode?: VideoImageMode) {
  const spec = videoModelSpec(modelId)
  if (!spec?.maxReferenceImages || !mode) return 1
  return mode === 'frames' ? spec.maxFrameImages ?? 2 : spec.maxReferenceImages
}

export function videoInputError(generation: VideoGeneration, count: number, hasText: boolean) {
  const limit = videoImageLimit(generation.modelId, generation.imageMode)
  if (count > limit) return `当前视频模式最多支持 ${limit} 张图片`
  if (generation.imageMode === 'reference' && (!count || !hasText)) return '请添加参考图并填写提示词'
  if (videoModelSpec(generation.modelId)?.provider === 'grok') {
    const issue = grokReferenceIssue(generation)
    if (issue) return issue.message
  }
  if (!hasText && videoModelSpec(generation.modelId)?.requiresPrompt) return '当前模型需要填写视频描述提示词'
  if (!hasText && !count) return '请输入视频描述，或添加首帧图'
}

export function frameRatioLocked(generation: VideoRatioParams, hasImage: boolean) {
  return hasImage && generation.imageMode !== 'reference' && Boolean(videoModelSpec(generation.modelId)?.locksFrameRatio)
}

function followsFrame(generation: VideoRatioParams, hasImage: boolean) {
  return hasImage && generation.imageMode !== 'reference' && (generation.ratio === 'auto' || frameRatioLocked(generation, true))
}

export function resolveVideoRatio(generation: VideoRatioParams, source?: { width: number; height: number }): VideoRatio {
  if (source && followsFrame(generation, true)) return closestVideoRatio(source.width, source.height, generation.modelId)
  return generation.ratio === 'auto' ? '16:9' : generation.ratio
}

export function videoRatioText(generation: VideoRatioParams, source?: { width: number; height: number }): string {
  return followsFrame(generation, Boolean(source)) ? '跟随首帧' : resolveVideoRatio(generation)
}

export function videoSize(generation: VideoGeneration, source?: { width: number; height: number }) {
  const [w, h] = resolveVideoRatio(generation, source).split(':').map(Number)
  const followSource = source && source.width > 0 && source.height > 0 && followsFrame(generation, true)
  const ratio = followSource ? source!.width / source!.height : w / h
  const short = resolutionShortEdge(generation.resolution)
  return {
    width: Math.round((ratio >= 1 ? short * ratio : short) / 2) * 2,
    height: Math.round((ratio >= 1 ? short : short / ratio) / 2) * 2,
  }
}
