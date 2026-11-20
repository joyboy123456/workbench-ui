import { z } from 'zod'

export const COMMERCE_MAIN_IMAGE_VERSION = 'main-image-v1' as const
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
const text = z.string().trim().min(1).max(600)
const box = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100),
  width: z.number().positive().max(100), height: z.number().positive().max(100) }).strict()
  .refine(v => v.x + v.width <= 100 && v.y + v.height <= 100, 'region_outside_canvas')

/** A design is one output image; its regions are not additional generation slots. */
export const commerceMainImageDesignSchema = z.object({
  referenceAssetId: id,
  referenceAnalysis: z.object({ layout: text, readingOrder: text, typography: text }).strict(),
  background: text,
  regions: z.array(z.object({ kind: z.enum(['product_detail', 'full_look', 'text']),
    box, description: text }).strict()).min(2).max(8),
  copy: z.array(z.object({ role: z.enum(['headline', 'subheadline', 'detail_label', 'look_label']),
    text: z.string().trim().min(1).max(40), placement: text,
    basis: z.enum(['visible_product', 'layout_label', 'user_supplied']),
    evidence: text,
  }).strict()).max(12),
  typography: z.object({ fontStyle: text, color: text, alignment: z.enum(['left', 'center']),
    subheadlineScalePct: z.number().min(40).max(60) }).strict(),
}).strict().superRefine((v, ctx) => {
  if (!v.regions.some(r => r.kind === 'product_detail' || r.kind === 'full_look')) ctx.addIssue({ code: 'custom', message: 'product_region_required' })
  if (v.copy.length && v.copy.filter(c => c.role === 'headline').length !== 1) ctx.addIssue({ code: 'custom', message: 'one_headline_required' })
  if (v.copy.filter(c => c.role === 'subheadline').length > 1) ctx.addIssue({ code: 'custom', message: 'duplicate_subheadline' })
  if (v.copy.reduce((n, c) => n + c.text.length, 0) > 100) ctx.addIssue({ code: 'custom', message: 'copy_too_long' })
})
export type CommerceMainImageDesign = z.infer<typeof commerceMainImageDesignSchema>
const compact = (value: string) => value.replace(/\s+/gu, '')
const numericRuns = (value: string) => [...value.matchAll(/\d+(?:\s*[-~～—–至到.]\s*\d+)*/gu)]
  .map(match => compact(match[0]).replace(/[～~—–至到]/gu, '-'))
/**
 * Conservative preflight: imagery alone is not evidence for touch, performance or sales claims.
 * userTexts are the user's own messages in this conversation, so facts stated in an earlier turn stay usable.
 * Arabic numerals (age ranges such as 3-6岁, sizes) pass only when the same numeric run appears in those messages.
 */
export function hasCommerceCopyEvidence(copy: CommerceMainImageDesign['copy'][number], userTexts: readonly string[]): boolean {
  if (copy.basis === 'user_supplied') return userTexts.some(text => text.includes(copy.evidence)) && copy.evidence.includes(copy.text)
  if (copy.basis === 'visible_product' && /[零一二两三四五六七八九十百千万]+(?:只|朵|颗|枚|个|条|件|款|色|种)/u.test(copy.text)) return false
  const userNumbers = new Set(userTexts.flatMap(numericRuns))
  const numbersGrounded = numericRuns(copy.text).every(number => userNumbers.has(number))
  if (!numbersGrounded) return false
  return !/[%％]|[￥¥]|价格|折扣|销量|认证|抗菌|防水|纯棉|羊绒含量|软糯|柔软|舒适|亲肤|保暖|温暖|耐穿|蓬松/u.test(copy.text)
}
export const commerceMainImageSnapshotSchema = z.object({
  version: z.literal(COMMERCE_MAIN_IMAGE_VERSION),
  outputs: z.array(z.object({ outputSlotId: id, design: commerceMainImageDesignSchema }).strict()).min(1).max(10),
}).strict()

/** Source IDs are resolved against the actual per-output image list, never model-supplied image numbers. */
export function compileCommerceMainImage(input: {
  design: CommerceMainImageDesign; imageRatio: string;
  sources: readonly { assetId: string; role: string }[]; primaryAssetId: string;
  userConstraints: readonly string[];
  /** Garment-fidelity and proportion lines shared with ordinary shoots, numbered against the same sources. */
  fidelityLines?: readonly string[];
}): string {
  const design = commerceMainImageDesignSchema.parse(input.design)
  const number = (id: string) => { const n = input.sources.findIndex(s => s.assetId === id); if (n < 0) throw new Error('main_image_source_missing'); return n + 1 }
  const primary = number(input.primaryAssetId)
  const reference = number(design.referenceAssetId)
  if (!input.sources.some(s => s.assetId === design.referenceAssetId && ['outfit_reference', 'style'].includes(s.role))) throw new Error('main_image_reference_invalid')
  const model = input.sources.find(s => s.role === 'model')
  return [
    `生成一张已经完成摄影、版式设计和中文排版的电商商品主图，画布比例${input.imageRatio}。只输出一个图片文件；内部多个展示区域、特写和穿搭人物共同组成这一张主图，不是多张任务，不要退化成一张单人棚拍素材。`,
    `图${primary}独占主推商品身份：所有区域都使用同一商品，按原图保留颜色、版型、宽高关系、图案、材质纹理、领口、袖口、下摆和结构；不得为了版式或姿势拉长、缩短或缩窄商品。取景裁切不是改变商品结构。`,
    '原图中图案元素的实际数量、排列和形状优先于下方文字观察；文字误数不能成为增减图案的依据。没有商品背面原图时不要自行增加背面展示。',
    `图${reference}为完整设计参考，必须看原图学习展示方法、主次比例、阅读顺序和文字层级。参考里的产品身份不能替换主推；不要复制其品牌Logo、价格、日期、折扣、销量、认证及原有宣传文案。`,
    `参考图${reference}中的完整人物展示数量与构图主次，以实际像素为准逐一保留；下方区域描述若把多个全身人物漏写成一个，必须按参考补齐，不能擅自改成背面。每个完整人物使用本次商品和指定模特，保留参考中各自的展示位置与用途。用户明确改变布局时才按用户要求调整。`,
    model ? `图${number(model.assetId)}为唯一模特身份来源；多个展示区域使用同一模特，五官与发色一致，真实儿童比例，不拉长腿或缩小头。人物图里的衣服不作为商品来源。` : '人物设计按本次明确要求，不能把竞品人物身份当作指定模特。',
    '其他商品原图与明确指定的陪衬按其原图保留；没有图像依据的区域不能编造隐藏结构或新增商品款式。',
    ...(input.fidelityLines ?? []),
    `【参考观察】${JSON.stringify(design.referenceAnalysis)}`,
    `【背景与摄影】${design.background}`,
    '【完整画面区域】坐标与尺寸为画布百分比，左上角为原点。产品区域为视觉重心，各区共同形成成熟商品图，不要网页卡片边框或机械等大格子。',
    ...design.regions.map((r, i) => `${i + 1}. ${r.kind}：左${r.box.x}%、上${r.box.y}%、宽${r.box.width}%、高${r.box.height}%；${r.description}`),
    `【仅允许的可见文字】${JSON.stringify(design.copy.map(c => ({ role: c.role, text: c.text, placement: c.placement })))}`,
    design.copy.length ? '上述text为必须逐字渲染的文案，其他字段仅供执行，不要印出字段名或分析。禁止自由补充宣称。' : '本轮没有可见文字，不添加标题、标签、Logo或营销文字。',
    `【排版】${design.typography.fontStyle}；${design.typography.color}；统一${design.typography.alignment === 'left' ? '左对齐' : '居中对齐'}。主标题最大且粗，副标题常规字重、字号为主标题${design.typography.subheadlineScalePct}%，细节标签更小；字距紧凑适中。文字放干净区域，与背景高对比，不遮挡产品图案与关键结构。`,
    '【本次用户要求】', ...input.userConstraints.map(s => `- ${s}`),
    '输出前检查：商品是否仍为原图同款；版式是否按主次呈现；指定的完整人物是否头脚齐全；文字是否逐字正确且可读；是否误带竞品Logo或无依据宣传。只生成这一个完整商品主图文件。',
  ].join('\n')
}
