import { isVideoModelSelectable, VIDEO_MODEL, VIDEO_MODEL_NAME } from './video-options'

export const REPLICA_VIDEO_MODEL_LABELS = {
  [VIDEO_MODEL_NAME]: VIDEO_MODEL,
} as const

export const REPLICA_SPOKEN_LABELS = {
  '保留原片口播与音效节奏': 'with_spoken',
  '纯音乐氛围（无口播）': 'no_spoken',
} as const

export const REPLICA_DELIVERY_LABELS = {
  '分镜复刻脚本 + 生成同款视频': 'video',
  '仅拆解复刻分镜脚本': 'storyboard',
} as const

export const REPLICA_RATIOS = ['9:16', '3:4', '16:9', '1:1'] as const
