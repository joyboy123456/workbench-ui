import type { ClothingTool } from '@/lib/clothing-tool-catalog'

/**
 * V2「AI 工具」统一差异化显示名（保留原数字 ID 与底层能力不变，与原平台名称保持细微区分）。
 */
export const V2_TOOL_DISPLAY_NAMES: Readonly<Record<number, string>> = {
  701: 'AI服装大片主图',
  705: '主图多机位裂变',
  706: '模特姿势裂变',
  80231: '参考版式仿图',
  702: '商品图局部换元素',
  707: '详情卖点套图裂变',
  80232: '智能多屏详情页',
  80262: '智能模特试穿',
  709: '多模特批量试穿',
  80212: '面料换花与同款改色',
  80213: '参考元素改款',
  80215: '服装制版平面线稿',
  80216: '单款衍生设计',
  80217: '多款融合设计',
  80238: '图案印花样机',
  80305: '商品多色延展',
  80239: '参考色调追色',
  80240: '画面瑕疵精修',
  80242: '超清画质增强',
  80243: '画面水印文字清理',
  80244: '智能净底抠图',
  80245: '矢量图形重绘',
  80301: '印花平铺提取',
  80302: '面料去布纹提纯',
  80303: '家纺多场景裂变',
  80304: '床品花型裂变',
  80263: '画面提示词反推',
  80264: '海报版式拆解',
  80210: '多场景批量换品',
  80258: '鞋包百货批量换品',
  80265: '长图详情整套仿制',
  80233: '带货视频分镜复刻',
}

/**
 * V2 新增的内置提示词模板工具（基础文生图/文生视频留在画布对话模式，工具广场仅收录结构化模板工具）。
 * 保持独立于旧 CLOTHING_TOOLS，避免破坏历史 28 工具与 Agent 路由回归基线。
 */
export const V2_EXTRA_TEMPLATE_TOOLS: readonly ClothingTool[] = [
  {
    id: 80210,
    name: V2_TOOL_DISPLAY_NAMES[80210],
    group: '服装主图',
    description: '上传新商品与多张场景底图，批量替换主体并融合环境光影',
    featureType: null,
    inputs: [
      '新商品主体图',
      '待换品场景图 1',
      '待换品场景图 2（可选）',
      '待换品场景图 3（可选）',
      '待换品场景图 4（可选）',
    ],
    output: '光影透视一致的多场景换品成图',
    stage: 'connected',
  },
  {
    id: 80258,
    name: V2_TOOL_DISPLAY_NAMES[80258],
    group: '服装主图',
    description: '针对鞋包配饰与百货小件，按多张场景底图批量替换商品主体',
    featureType: null,
    inputs: [
      '小商品白底或实拍图',
      '目标场景底图 1',
      '目标场景底图 2（可选）',
      '目标场景底图 3（可选）',
    ],
    output: '保留真实比例与接触阴影的小件场景图',
    stage: 'connected',
  },
  {
    id: 80265,
    name: V2_TOOL_DISPLAY_NAMES[80265],
    group: '详情页',
    description: '按多张参考详情屏逐屏仿制版式，生成风格统一的整套详情图',
    featureType: null,
    inputs: [
      '自家商品主图',
      '参考详情屏 1',
      '参考详情屏 2（可选）',
      '参考详情屏 3（可选）',
      '参考详情屏 4（可选）',
    ],
    output: '逐屏对齐版式节奏的整套详情页图片',
    stage: 'connected',
  },
  {
    id: 80233,
    name: V2_TOOL_DISPLAY_NAMES[80233],
    group: '视频创作',
    description: '拆解参考视频分镜节奏，冻结镜头时间轴替换商品与模特出片',
    featureType: null,
    inputs: [
      '参考爆款视频',
      '商品主图',
      '商品细节图 1（可选）',
      '商品细节图 2（可选）',
      '模特参考图（可选）',
    ],
    output: '结构冻结复刻分镜脚本与同款带货短视频',
    stage: 'utility',
  },
]

/** 由 V2 内置系统提示词模板直接规划执行的工具（含原 5 个未直连工具 + 3 个新增电商模板工具） */
export const V2_DIRECT_TEMPLATE_TOOL_IDS = [
  701,
  705,
  706,
  707,
  80212,
  80210,
  80258,
  80265,
] as const

export type V2DirectTemplateToolId = (typeof V2_DIRECT_TEMPLATE_TOOL_IDS)[number]

export function isV2DirectTemplateToolId(id: number): id is V2DirectTemplateToolId {
  return (V2_DIRECT_TEMPLATE_TOOL_IDS as readonly number[]).includes(id)
}

export function v2ToolDisplayName(id: number, fallback: string): string {
  return V2_TOOL_DISPLAY_NAMES[id] ?? fallback
}
