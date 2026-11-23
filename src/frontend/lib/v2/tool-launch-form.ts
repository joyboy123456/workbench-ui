import { DETAIL_CATEGORIES } from '@/lib/product-detail'
import { COLOR_SCHEME_CATEGORIES, HOME_TEXTILE_CATEGORIES } from '@/lib/textile-tools'
import { isExecutableClothingToolId, isImageTextToolId } from '@/lib/clothing-tool-ids'
import {
  REPLICA_DELIVERY_LABELS,
  REPLICA_RATIOS,
  REPLICA_SPOKEN_LABELS,
  REPLICA_VIDEO_MODEL_LABELS,
} from './viral-video-replica-contract'
import { isV2DirectTemplateToolId } from './v2-template-tools'
import type { ToolCatalogItem } from './types'
import { VIDEO_MODEL_NAME } from './video-options'

export const catalogToolIsVideoReplica = (id: string) => id === '80233'
export const catalogToolUsesAgent = (id: string) => {
  const num = Number(id)
  return !catalogToolIsVideoReplica(id) && !isExecutableClothingToolId(num) && !isV2DirectTemplateToolId(num)
}
export const catalogToolReturnsText = (id: string) => isImageTextToolId(Number(id))

export interface ToolFormSlot {
  key: string
  label: string
  required: boolean
  isTemplateTarget: boolean
  accept?: 'image' | 'video'
}

export interface ToolExtraField {
  key: string
  label: string
  kind: 'text' | 'select' | 'number' | 'textarea'
  required?: boolean
  placeholder?: string
  options?: readonly string[]
  defaultValue?: string
  min?: number
  max?: number
}

export interface ToolFormConfig {
  slots?: string[]
  extraFields?: ToolExtraField[]
  defaultRatio?: string
  ratios?: readonly string[]
  resolutions?: readonly string[]
  defaultResolution?: string
  fixedResolution?: string
  hidePrompt?: boolean
  videoReplica?: boolean
  hint?: string
}

export const TOOL_FORM_CONFIGS: Record<string, ToolFormConfig> = {
  '701': {
    slots: ['服装商品主图', '模特参考图（可选）', '场景光影参考图（可选）'],
    extraFields: [
      {
        key: 'shootScene',
        label: '商拍场景模板',
        kind: 'select',
        options: ['极简高级影棚', '都市街拍自然光', '法式复古室内', '户外阳光草坪', '买手店陈列空间'],
        defaultValue: '极简高级影棚',
      },
      {
        key: 'shotFraming',
        label: '镜头景别',
        kind: 'select',
        options: ['全身穿搭主图', '七分身黄金构图', '半身材质特写'],
        defaultValue: '全身穿搭主图',
      },
      { key: 'count', label: '生成张数', kind: 'select', options: ['1', '2', '4'], defaultValue: '2' },
    ],
    hint: '已内置商业大片布光与材质保真模板，只需上传服装图并选场景即可直出。',
  },
  '705': {
    slots: ['服装主图'],
    extraFields: [
      {
        key: 'cameraPreset',
        label: '机位组合模板',
        kind: 'select',
        options: ['标准主图多角度', '细节质感特写组', '街拍动态抓拍组'],
        defaultValue: '标准主图多角度',
      },
      { key: 'count', label: '机位套图张数', kind: 'select', options: ['2', '4', '6', '8'], defaultValue: '4' },
    ],
    hint: '自动锁定人物五官与服装版型细节，按所选机位模板并发生成整套多角度图。',
  },
  '706': {
    slots: ['服装模特图'],
    extraFields: [
      {
        key: 'posePreset',
        label: '姿态风格模板',
        kind: 'select',
        options: ['自然松弛站姿', '动态走动抓拍', '休闲倚靠坐姿', '廓形展示姿态'],
        defaultValue: '自然松弛站姿',
      },
      { key: 'count', label: '姿势裂变张数', kind: 'select', options: ['2', '4', '6', '8'], defaultValue: '4' },
    ],
    hint: '保持原图模特身份、服装穿搭与背景环境一致，仅裂变不同商拍动作姿态。',
  },
  '80262': {
    slots: ['人物底图', '服装参考图', '服装细节图 1（可选）', '服装细节图 2（可选）'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：连衣裙、西装外套' },
      { key: 'scene', label: '场景与光影', kind: 'text', placeholder: '留空保持原环境' },
    ],
  },
  '709': {
    slots: ['人物底图', '服装参考图', '服装细节图 1（可选）', '服装细节图 2（可选）'],
    extraFields: [{ key: 'count', label: '生成张数', kind: 'select', options: ['2', '4', '6'], defaultValue: '4' }],
  },
  '702': {
    slots: ['原图', '替换对象参考图'],
    extraFields: [{ key: 'replaceMode', label: '替换模式', kind: 'select', options: ['替换环境/背景', '替换鞋子/配饰', '替换模特', '替换服装'], defaultValue: '替换环境/背景' }],
  },
  '80232': {
    slots: ['产品图', '产品细节图 1（可选）', '产品细节图 2（可选）', '产品细节图 3（可选）', '产品细节图 4（可选）', '产品细节图 5（可选）', '指定模特图（可选）'],
    defaultRatio: '2:3',
    extraFields: [
      { key: 'productCategory', label: '商品品类', kind: 'select', options: DETAIL_CATEGORIES, defaultValue: DETAIL_CATEGORIES[0] },
      { key: 'sellingPoints', label: '标题与卖点', kind: 'textarea', placeholder: '仅填写已确认的商品卖点或活动文案' },
      { key: 'screenCount', label: '详情屏数（1–10 屏）', kind: 'number', min: 1, max: 10, defaultValue: '3' },
    ],
    hint: '每屏单独生成并保存，完成后可在右侧逐屏查看或进入画布拼接长图。',
  },
  '80231': {
    slots: ['商品图', '版式参考图', '同款商品细节图 1（可选）', '同款商品细节图 2（可选）'],
    extraFields: [
      { key: 'productCategory', label: '商品品类', kind: 'text', placeholder: '例如：连衣裙、防晒衣' },
      { key: 'sellingPoints', label: '标题与卖点', kind: 'textarea', placeholder: '仅填写已确认的商品卖点或活动文案' },
    ],
  },
  '707': {
    slots: ['商品图', '细节参考图（可选）'],
    extraFields: [
      { key: 'detailStyle', label: '套图类型', kind: 'select', options: ['白底商品图', '3D 悬浮展示', '面料部位特写', '多场景电商套图'], defaultValue: '多场景电商套图' },
      { key: 'count', label: '生成张数', kind: 'select', options: ['2', '4', '6'], defaultValue: '4' },
    ],
  },
  '80212': {
    slots: ['服装图', '目标面料/花型参考图（可选）'],
    extraFields: [
      { key: 'editMode', label: '换色模式', kind: 'select', options: ['按参考图替换花型/面料', '同料换色（文字指定颜色）'], defaultValue: '按参考图替换花型/面料' },
      { key: 'targetPart', label: '替换部位', kind: 'text', placeholder: '默认整件服装；可填：上衣、半裙、袖部拼色等' },
      { key: 'targetColor', label: '目标颜色（同料换色填写）', kind: 'text', placeholder: '例如：燕麦奶白、复古酒红、#2E4A62' },
    ],
  },
  '80210': {
    slots: [
      '新商品主体图',
      '待换品场景图 1',
      '待换品场景图 2（可选）',
      '待换品场景图 3（可选）',
      '待换品场景图 4（可选）',
    ],
    extraFields: [
      { key: 'productCategory', label: '商品品类', kind: 'text', placeholder: '例如：针织开衫、连衣裙、羽绒服' },
      { key: 'wearNote', label: '穿戴/摆放细节', kind: 'text', placeholder: '选填：如“裤脚垂至脚踝”“敞开穿搭”' },
    ],
    hint: '上传 1 张新商品与 1～4 张待替换场景底图，每张底图自动独立替换为新商品并融合场景光影。',
  },
  '80258': {
    slots: [
      '小商品白底或实拍图',
      '目标场景底图 1',
      '目标场景底图 2（可选）',
      '目标场景底图 3（可选）',
    ],
    extraFields: [
      {
        key: 'itemType',
        label: '小商品类目',
        kind: 'select',
        options: ['鞋靴', '箱包皮具', '首饰配饰', '美妆个护', '家居百货小件'],
        defaultValue: '箱包皮具',
      },
    ],
    hint: '专为鞋包配饰与小件百货定制，自动对齐原图商品尺寸比例、接触阴影与五金材质反光。',
  },
  '80265': {
    slots: [
      '自家商品主图',
      '参考详情屏 1',
      '参考详情屏 2（可选）',
      '参考详情屏 3（可选）',
      '参考详情屏 4（可选）',
    ],
    defaultRatio: '2:3',
    extraFields: [
      { key: 'productCategory', label: '商品品类', kind: 'select', options: DETAIL_CATEGORIES, defaultValue: DETAIL_CATEGORIES[0] },
      { key: 'sellingPoints', label: '自家核心卖点', kind: 'textarea', placeholder: '仅填写已确认的面料、工艺或版型卖点，留空则仅复刻视觉版式' },
    ],
    hint: '上传自家商品与 1～4 张竞品详情屏，逐屏对齐版式重心与信息节奏直出整套详情图。',
  },
  '80305': {
    slots: ['服装商品图'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'select', options: COLOR_SCHEME_CATEGORIES, defaultValue: '上衣' },
      { key: 'colorDirections', label: '配色方向', kind: 'textarea', placeholder: '例如：奶油白、雾霾蓝、焦糖棕（可填 HEX 色值）' },
    ],
  },
  '80213': {
    slots: ['改款参考图', '待修改原款图'],
    extraFields: [
      { key: 'element', label: '参考款式元素', kind: 'text', required: true, placeholder: '例如：V 领设计、泡泡袖、腰部抽绳' },
      { key: 'position', label: '原款改动位置', kind: 'text', required: true, placeholder: '例如：领口与袖口' },
    ],
  },
  '80216': {
    slots: ['原款图'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：卫衣、衬衫' },
      { key: 'designCount', label: '单图款式方案数', kind: 'number', min: 1, max: 9, defaultValue: '4' },
    ],
  },
  '80217': {
    slots: ['款式参考图 1', '款式参考图 2', '款式参考图 3（可选）', '款式参考图 4（可选）'],
    extraFields: [
      { key: 'categoryName', label: '商品品类', kind: 'text', placeholder: '例如：夹克、风衣' },
      { key: 'designCount', label: '融合方案数', kind: 'number', min: 1, max: 4, defaultValue: '1' },
    ],
  },
  '80215': {
    slots: ['服装图（单面）'],
    extraFields: [
      { key: 'categoryName', label: '服装名称', kind: 'text', required: true, placeholder: '必填，例如：衬衫、连衣裙、羽绒服' },
    ],
  },
  '80238': {
    slots: ['商品底图', '图案或 Logo 素材'],
    extraFields: [
      { key: 'placement', label: '图案贴合位置', kind: 'select', options: ['胸前居中', '左胸口小标', '后背居中', '袖口/下摆'], defaultValue: '胸前居中' },
    ],
  },
  '80242': {
    slots: ['待放大图片'],
    fixedResolution: '4K',
    hint: '生成式画质增强至 4K，适合老旧糊图提清。',
  },
  '80240': {
    slots: ['待修复原图', '细节参考图（可选）'],
    extraFields: [
      { key: 'position', label: '需修复的部位', kind: 'text', required: true, placeholder: '必填，例如：左手手指、衣领褶皱' },
    ],
  },
  '80243': {
    slots: ['待处理原图'],
  },
  '80239': {
    slots: ['待校色图', '目标色彩参考图'],
  },
  '80245': {
    slots: ['待转换原图'],
    defaultRatio: '1:1',
  },
  '80301': {
    fixedResolution: '2K',
    slots: ['带花型的服装或面料图'],
    defaultRatio: '1:1',
    extraFields: [
      { key: 'seamless', label: '平铺方式', kind: 'select', options: ['四方连续平铺', '单幅平面花型'], defaultValue: '四方连续平铺' },
    ],
  },
  '80302': {
    slots: ['待处理面料图'],
    hidePrompt: true,
    extraFields: [
      { key: 'cleanLevel', label: '去布纹强度', kind: 'select', options: ['轻度保留质感', '标准清理', '强力平整'], defaultValue: '标准清理' },
    ],
  },
  '80303': {
    slots: ['家纺产品主图', '同商品细节图 1（可选）', '同商品细节图 2（可选）', '同商品细节图 3（可选）'],
    extraFields: [
      { key: 'categoryName', label: '家纺品类', kind: 'select', options: HOME_TEXTILE_CATEGORIES, defaultValue: '四件套' },
      { key: 'textileMode', label: '裂变模式', kind: 'select', options: ['多场景套图', '多机位视角'], defaultValue: '多场景套图' },
    ],
  },
  '80304': {
    slots: ['原花型或成品图'],
    defaultRatio: '1:1',
    extraFields: [
      { key: 'scenarios', label: '花型风格方向', kind: 'textarea', placeholder: '每行一个风格，例如：法式碎花、极简条纹、莫兰迪几何' },
    ],
  },
  '80263': {
    slots: ['图片'],
    hint: '视觉分析模型，完成后在右侧直接输出可一键复制的中文提示词。',
  },
  '80264': {
    slots: ['海报图'],
    hint: '拆解海报的构图、排版层级与视觉风格，完成后可在右侧一键复制。',
  },
  '80233': {
    videoReplica: true,
    slots: [
      '参考爆款视频',
      '商品主图',
      '商品细节图 1（可选）',
      '商品细节图 2（可选）',
      '模特参考图（可选）',
    ],
    defaultRatio: '9:16',
    ratios: REPLICA_RATIOS,
    resolutions: ['720p', '1080p', '480p'],
    defaultResolution: '720p',
    extraFields: [
      {
        key: 'deliveryMode',
        label: '交付模式',
        kind: 'select',
        options: Object.keys(REPLICA_DELIVERY_LABELS),
        defaultValue: '分镜复刻脚本 + 生成同款视频',
      },
      {
        key: 'videoModel',
        label: '视频生成模型',
        kind: 'select',
        options: Object.keys(REPLICA_VIDEO_MODEL_LABELS),
        defaultValue: VIDEO_MODEL_NAME,
      },
      {
        key: 'duration',
        label: '复刻时长',
        kind: 'select',
        options: ['5 秒', '10 秒', '15 秒', '30 秒'],
        defaultValue: '10 秒',
      },
      {
        key: 'trimStart',
        label: '参考视频截取起点（秒）',
        kind: 'number',
        min: 0,
        max: 175,
        defaultValue: '0',
      },
      {
        key: 'spokenMode',
        label: '口播与音效节奏',
        kind: 'select',
        options: Object.keys(REPLICA_SPOKEN_LABELS),
        defaultValue: '保留原片口播与音效节奏',
      },
      {
        key: 'sellingPoints',
        label: '商品卖点与口播补充',
        kind: 'textarea',
        placeholder: '选填：仅填写已确认的面料、版型卖点或口播关键词；不改变原片分镜顺序与时间轴',
      },
    ],
    hint: '上传 MP4 / MOV 参考视频（≤80MB、≤180秒），自动拆解原片镜头并 100% 冻结时间轴替换您的商品与模特。',
  },
}

export const TOOL_FORM_RATIOS = ['3:4', '1:1', '2:3', '9:16', '16:9'] as const

export function getToolFormConfig(toolId: string): ToolFormConfig {
  return TOOL_FORM_CONFIGS[toolId] ?? {}
}

/** 按 workbench 28 工具配置 + tool.inputs 规则生成表单上传槽位 */
export function buildToolFormSlots(tool: Pick<ToolCatalogItem, 'id' | 'inputs'>): ToolFormSlot[] {
  const cfg = TOOL_FORM_CONFIGS[tool.id]
  const raw = cfg?.slots?.length
    ? cfg.slots
    : tool.inputs.length > 0
      ? tool.inputs
      : ['商品图', '参考图（可选）']
  const parsed = raw.map((label, idx) => {
    const optional = /可选|选填/.test(label)
    const cleanLabel = label.replace(/[（(]\s*(可选|选填)\s*[）)]/g, '').trim()
    const isVideo = /视频/.test(cleanLabel)
    return {
      key: `slot_${idx}`,
      label: cleanLabel || label,
      required: !optional,
      isTemplateTarget: false,
      accept: (isVideo ? 'video' : 'image') as 'image' | 'video',
    }
  })
  const target = parsed.find((slot, index) =>
    slot.accept !== 'video' && (index > 0 || tool.id === '80213') && /参考|图案或/.test(slot.label) && !/细节/.test(slot.label))
  if (target) target.isTemplateTarget = true
  return parsed
}
