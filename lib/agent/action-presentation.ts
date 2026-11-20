import type { Phase1ActionCopyCategory, Phase1ActionState, Phase1BlockedReasonCode } from './phase1-photo-delivery-contract'

/** 服务端事件和浏览器共用固定文案，不从模型或供应商原文生成行动标题。 */
export const ACTION_COPY: Readonly<Record<Phase1ActionCopyCategory, string>> = {
  recognizing_garments: '识别服装',
  viewing_images: '查看服装原图',
  searching_wardrobe: '查找搭配素材',
  searching_references: '匹配穿搭参考',
  matching_outfits: '匹配搭配',
  submitting_shoot: '提交拍摄',
  loading_skill: '读取专业技能',
  checking_assets: '检查素材',
  checking_canvas: '查看画布素材',
  checking_task: '查询任务进度',
  viewing_models: '查看店铺模特',
  proposing_outfits: '适配新品搭配',
  preparing_images: '准备拍摄计划',
  preparing_cutout: '准备抠图',
  stopping_task: '处理停止请求',
  retrying_shots: '准备镜头重试',
}

const TOOL_CATEGORIES: Readonly<Record<string, Phase1ActionCopyCategory>> = {
  'asset.inspect': 'checking_assets',
  'session.list_nodes': 'checking_canvas',
  'task.get_status': 'checking_task',
  'garment.classify': 'recognizing_garments',
  'skill.load': 'loading_skill',
  'wardrobe.search': 'searching_wardrobe',
  'wardrobe.inspect': 'viewing_images',
  'outfit.match': 'matching_outfits',
  'outfit.search': 'searching_references',
  'model_library.list': 'viewing_models',
  'outfit.propose': 'proposing_outfits',
  'image.create': 'preparing_images',
  'fashion_photo.create': 'preparing_images',
  'photo_fission.create': 'preparing_images',
  'pose_fission.create': 'preparing_images',
  'garment_detail.create': 'preparing_images',
  'cutout.prepare': 'preparing_cutout',
  'task.cancel': 'stopping_task',
  'task.retry_shots': 'retrying_shots',
}

export function actionCategoryForTool(toolName: string): Phase1ActionCopyCategory | undefined {
  return Object.hasOwn(TOOL_CATEGORIES, toolName) ? TOOL_CATEGORIES[toolName] : undefined
}

export const ACTION_STATE_COPY: Readonly<Record<Phase1ActionState, string>> = {
  running: '进行中', queued: '排队中', completed: '完成', blocked: '受阻', failed: '失败',
}

/** 用户先看到可理解的受阻原因；稳定枚举仅留给展开后的技术详情。 */
export const BLOCKED_REASON_COPY: Readonly<Record<Phase1BlockedReasonCode, string>> = {
  missing_primary_image: '缺少主推原图',
  no_available_model: '没有可用的店铺模特',
  conflicting_requirements: '需求之间存在冲突',
  no_available_accompaniment: '缺少可搭配的陪衬单品',
  primary_image_unusable: '主推原图无法使用',
  batch_limit_exceeded: '本批图片数量超过上限',
}

export function blockedReasonLabel(code: Phase1BlockedReasonCode): string {
  return BLOCKED_REASON_COPY[code]
}

export function actionSummary(category: Phase1ActionCopyCategory, state: Phase1ActionState): string {
  return `${ACTION_COPY[category]} · ${ACTION_STATE_COPY[state]}`
}
