import { z } from 'zod'
import type { ComposerGeneration } from './composer-options'

/**
 * 视频模式唯一的供应商模型（Web 通道）。grok-imagine-video-1.5 走 Build 通道、
 * 极耗额度，任何路径都不允许提交；白名单由 videoGenerationSchema 的字面量强制。
 */
export const VIDEO_MODEL = 'grok-imagine-video'
export const VIDEO_MODEL_NAME = 'Grok Imagine Video'
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '3:4', '4:3'] as const
export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const
export const VIDEO_DURATIONS = [6, 10, 15] as const

export const videoGenerationSchema = z.object({
  modelId: z.literal(VIDEO_MODEL), ratio: z.enum(VIDEO_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS), count: z.literal(1), duration: z.union([z.literal(6), z.literal(10), z.literal(15)]),
}).strict()
export type VideoGeneration = z.infer<typeof videoGenerationSchema>
export const defaultVideoGeneration: VideoGeneration = { modelId: VIDEO_MODEL, ratio: '16:9', resolution: '720p', count: 1, duration: 6 }

/** 宽容读取（本地偏好等来源的 unknown JSON），非法值回落默认，提交前仍以 schema 为准。 */
export function normalizeVideoGeneration(value?: unknown): VideoGeneration {
  const source = value && typeof value === 'object' ? value as Partial<ComposerGeneration> : undefined
  const ratio = VIDEO_RATIOS.includes(source?.ratio as never) ? source!.ratio as VideoGeneration['ratio'] : defaultVideoGeneration.ratio
  const resolution = VIDEO_RESOLUTIONS.includes(source?.resolution as never) ? source!.resolution as VideoGeneration['resolution'] : defaultVideoGeneration.resolution
  const duration = VIDEO_DURATIONS.includes(source?.duration as never) ? source!.duration as VideoGeneration['duration'] : defaultVideoGeneration.duration
  return { modelId: VIDEO_MODEL, ratio, resolution, count: 1, duration }
}

export interface VideoMedia { url: string; duration: number; width: number; height: number }
export const videoMediaSchema = z.object({
  url: z.string().min(1).max(4096).refine(value => /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value), '视频需要持久化地址'),
  duration: z.number().positive().max(600), width: z.number().positive(), height: z.number().positive(),
}).strict()

/** 首帧存在时匹配最接近原图宽高比的供应商合法比例。 */
export function closestVideoRatio(width: number, height: number): VideoGeneration['ratio'] {
  if (!(width > 0 && height > 0)) return defaultVideoGeneration.ratio
  const target = width / height
  let best: VideoGeneration['ratio'] = VIDEO_RATIOS[0]
  let minDiff = Infinity
  for (const candidate of VIDEO_RATIOS) {
    const [w, h] = candidate.split(':').map(Number)
    const diff = Math.abs(Math.log((w / h) / target))
    if (diff < minDiff) { minDiff = diff; best = candidate }
  }
  return best
}

/** 输出画幅：有首帧时跟随原图比例，否则按所选比例；短边对齐分辨率档位。 */
export function videoSize(generation: VideoGeneration, source?: { width: number; height: number }) {
  const [w, h] = generation.ratio.split(':').map(Number)
  const ratio = source && source.width > 0 && source.height > 0 ? source.width / source.height : w / h
  const short = generation.resolution === '1080p' ? 1080 : 720
  return {
    width: Math.round((ratio >= 1 ? short * ratio : short) / 2) * 2,
    height: Math.round((ratio >= 1 ? short : short / ratio) / 2) * 2,
  }
}
