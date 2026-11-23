/** 仅供 V2 后端使用，不加入旧工作台侧栏目录。 */
export const V2_IMAGE_OP_TOOL_IDS = [80246, 80247, 80248, 80249, 80250, 80251, 80252, 80253, 80254] as const
export type V2ImageOpToolId = (typeof V2_IMAGE_OP_TOOL_IDS)[number]

/** original 仅用于配合 scale 扩大原比例画布；21:9 对齐椒图 extendImage 的 8 个比例。 */
export const V2_OUTPAINT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9', 'original'] as const
export type V2OutpaintRatio = (typeof V2_OUTPAINT_RATIOS)[number]
/** 椒图 imageSize 档位，对应 Grsai 请求的 1K/2K/4K；缺省按原图长边就近取档。 */
export const V2_OUTPAINT_IMAGE_SIZES = ['1K', '2K', '4K'] as const
export type V2OutpaintImageSize = (typeof V2_OUTPAINT_IMAGE_SIZES)[number]
/** 比例模式输出画布长边（同时转换为 Grsai 请求的生成档位）。 */
export const OUTPAINT_IMAGE_SIZE_LONG_SIDES: Readonly<Record<V2OutpaintImageSize, number>> = { '1K': 1024, '2K': 2048, '4K': 4096 }
/** 原图长边就近取档：以相邻档位的几何中点 1448 / 2896 为分界。 */
export function defaultOutpaintImageSize(width: number, height: number): V2OutpaintImageSize {
  const longSide = Math.max(width, height)
  if (longSide < Math.sqrt(OUTPAINT_IMAGE_SIZE_LONG_SIDES['1K'] * OUTPAINT_IMAGE_SIZE_LONG_SIDES['2K'])) return '1K'
  if (longSide < Math.sqrt(OUTPAINT_IMAGE_SIZE_LONG_SIDES['2K'] * OUTPAINT_IMAGE_SIZE_LONG_SIDES['4K'])) return '2K'
  return '4K'
}

/** 比例扩图按档位固定长边，短边取整到最近的 8 像素。 */
export function outpaintRatioTarget(ratioWidth: number, ratioHeight: number, tier: V2OutpaintImageSize) {
  const longSide = OUTPAINT_IMAGE_SIZE_LONG_SIDES[tier]
  const shortSide = Math.max(8, Math.round(longSide * Math.min(ratioWidth, ratioHeight) / Math.max(ratioWidth, ratioHeight) / 8) * 8)
  return ratioWidth >= ratioHeight ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide }
}
/** 仅允许已接入 Grsai 渠道映射的图像模型；镜像 image-provider-pool 的 MODEL_CHANNEL_ROUTES 键。 */
export const V2_OUTPAINT_MODELS = ['nano-banana-pro', 'nano-banana-2', 'nano-banana-2.1', 'nano-banana-2-lite', 'gpt-image-2.5', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'] as const
export type V2OutpaintModel = (typeof V2_OUTPAINT_MODELS)[number]
export const V2_IMAGE_ANGLES = ['front', 'back', 'left', 'right', 'three-quarter', 'top'] as const
export type V2ImageAngle = (typeof V2_IMAGE_ANGLES)[number]
export const V2_MOCKUP_CARRIERS = ['tshirt', 'hoodie', 'tote-bag', 'phone-case', 'mug', 'packaging-box', 'poster'] as const

export interface V2ImagePosition {
  /** 水平方向归一化位置，0 为最左，1 为最右。 */
  x: number
  /** 垂直方向归一化位置，0 为最上，1 为最下。 */
  y: number
}
export interface V2ImageTargetBox extends V2ImagePosition {
  /** 目标框宽度占转正后原图宽度的比例，须大于 0。 */
  w: number
  /** 目标框高度占转正后原图高度的比例，须大于 0。 */
  h: number
}
interface V2ImageOpBase {
  /** 门面按规范请求计算；幂等重放不重新解析原图。 */
  requestDigest?: string
}
interface V2MaskedImageOp {
  /** 账号拥有的单帧 PNG 蒙版资产；白色为处理区，尺寸等于转正后原图。 */
  maskAssetId: string
  /** 蒙版原始存储字节的完整 SHA-256；执行时再次校验。 */
  maskDigest: string
}
export type V2ImageOp = V2ImageOpBase & (
  | {
    /** 扩图；保留原图内容并扩大画布。 */
    op: 'outpaint'
    /** 目标画布比例（对齐椒图 extendImage）；original 仅配合 scale>1 使用。 */
    ratio?: V2OutpaintRatio
    /** 四边增加的原图宽/高百分比；与 scale、position 不组合。 */
    pads?: {
      /** 上边扩展原高的 0–100 整数百分比。 */
      top: number
      /** 右边扩展原宽的 0–100 整数百分比。 */
      right: number
      /** 下边扩展原高的 0–100 整数百分比。 */
      bottom: number
      /** 左边扩展原宽的 0–100 整数百分比。 */
      left: number
    }
    /** 按像素扩四边（旧版 ComfyUI 契约 legacy，每边 0–16384）；不能与 ratio/pads 同时使用。 */
    padPixels?: {
      /** 上边扩展像素数。 */
      top: number
      /** 右边扩展像素数。 */
      right: number
      /** 下边扩展像素数。 */
      bottom: number
      /** 左边扩展像素数。 */
      left: number
    }
    /** 原图在画布内的相对大小：先等比缩放到恰好包含，再按 1/scale 占比放入；默认 1，越大扩展区越多。 */
    scale?: 1 | 1.5 | 2
    /** 原图在可移动余量内的位置，默认 { x: 0.5, y: 0.5 }。 */
    position?: V2ImagePosition
    /** 生成档位：比例模式下输出画布长边 = 档位像素（1K=1024/2K=2048/4K=4096，短边按比例取整为 8 的倍数），并向 Grsai 请求同档；缺省按转正后原图长边就近取档。 */
    imageSize?: V2OutpaintImageSize
    /** 补全区域内容要求，≤8000 字；不得据此改动原图区域。 */
    prompt?: string
    /** 供应商模型，缺省 nano-banana-pro；仅限已接入 Grsai 映射的图像模型。 */
    model?: V2OutpaintModel
    /** 回贴原图时的边缘羽化像素，0–64，缺省 24。 */
    feathering?: number
  }
  | (V2MaskedImageOp & {
    /** 蒙版内自由修改，蒙版外硬回填原图。 */
    op: 'inpaint'
    maskType?: 'brush'
    /** 修改描述，必填，最多 500 个 Unicode 字符。 */
    prompt: string
  })
  | (V2MaskedImageOp & {
    /** 蒙版内消除对象，蒙版外硬回填原图。 */
    op: 'erase'
  })
  | {
    /** 保留已有 2K 放大契约，本次不新增增强工具。 */
    op: 'upscale-2x'
  }
  | (V2MaskedImageOp & {
    /** 仅改蒙版内文字，蒙版外硬回填原图。 */
    op: 'text-edit'
    /** 用于定位的原文字，最多 100 字，可省略。 */
    originalText?: string
    /** 需要逐字呈现的新文字，非空，最多 100 字；不裁剪首尾空格。 */
    newText: string
    /** 字体描述，最多 100 字；默认延续原字体。 */
    font?: string
    /** 颜色描述，最多 100 字；默认延续原颜色。 */
    color?: string
  })
  | (V2MaskedImageOp & {
    /** 将源蒙版物体移到目标框；整图重绘，尺寸保持原图大小。 */
    op: 'move'
    /** 转正后原图坐标系中的左上角及宽高；x+w、y+h 不得超过 1。 */
    targetBox: V2ImageTargetBox
  })
  | {
    /** 一次生成宫格并切成多个角度资产。 */
    op: 'multi-angle'
    /** 选择 2–4 个不重复角度；顺序即返回结果顺序。 */
    angles: V2ImageAngle[]
  }
  | {
    /** 一次生成 sprite sheet，再合成循环 GIF；同时返回原拼图。 */
    op: 'gif'
    /** 动作描述，必填，最多 300 字。 */
    motion: string
    /** 动画帧数，默认 6；4/6/9 分别使用 2×2/3×2/3×3 宫格。 */
    frames?: 4 | 6 | 9
    /** 每帧毫秒数，默认 200，范围 100–500；GIF 编码取最近 10ms。 */
    frameMs?: number
  }
  | {
    /** 将原图设计自然印到指定载体上。 */
    op: 'mockup'
    /** 预置载体，与 carrierPrompt 二选一。 */
    carrier?: (typeof V2_MOCKUP_CARRIERS)[number]
    /** 自定义载体描述，非空且最多 200 字。 */
    carrierPrompt?: string
  }
)

export const V2_IMAGE_OP_IDS: Readonly<Record<V2ImageOp['op'], V2ImageOpToolId>> = {
  outpaint: 80246, inpaint: 80247, erase: 80248, 'upscale-2x': 80249,
  'text-edit': 80250, move: 80251, 'multi-angle': 80252, gif: 80253, mockup: 80254,
}
export const V2_IMAGE_ANGLE_LABELS: Record<V2ImageAngle, string> = {
  front: '正面', back: '背面', left: '左侧', right: '右侧', 'three-quarter': '四分之三侧面', top: '俯视',
}
export function imageOpOutputCount(op: V2ImageOp): number {
  return op.op === 'multi-angle' ? op.angles.length : op.op === 'gif' ? 2 : 1
}
export function isV2ImageOpToolId(id: unknown): id is V2ImageOpToolId {
  return typeof id === 'number' && (V2_IMAGE_OP_TOOL_IDS as readonly number[]).includes(id)
}

/** 返回内部蒙版资产身份，供任务关联授权使用。 */
export function imageOpMaskAssetId(op: V2ImageOp | undefined): string | undefined {
  return op && 'maskAssetId' in op ? op.maskAssetId : undefined
}
