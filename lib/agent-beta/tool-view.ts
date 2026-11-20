import { ACTION_COPY, actionCategoryForTool } from '@/lib/agent/action-presentation'

export type RunToolIcon = 'book' | 'search' | 'tag' | 'scissor' | 'reload' | 'cancel' | 'retry' | 'create'

export interface ToolPresentation {
  label: string
  icon?: RunToolIcon
  botActivity?: 'search' | 'styling'
}

/** 同一工具的图标/表情视图资料；用户文案统一从 action-presentation 读取。 */
const TOOL_PRESENTATIONS: Readonly<Record<string, ToolPresentation>> = {
  'asset.inspect': { label: ACTION_COPY.checking_assets, icon: 'search', botActivity: 'search' },
  'session.list_nodes': { label: ACTION_COPY.checking_canvas },
  'task.get_status': { label: ACTION_COPY.checking_task, icon: 'reload' },
  'garment.classify': { label: ACTION_COPY.recognizing_garments, icon: 'tag' },
  'skill.load': { label: ACTION_COPY.loading_skill, icon: 'book', botActivity: 'search' },
  'wardrobe.search': { label: ACTION_COPY.searching_wardrobe, botActivity: 'search' },
  'wardrobe.inspect': { label: ACTION_COPY.viewing_images, botActivity: 'search' },
  'outfit.match': { label: ACTION_COPY.matching_outfits, botActivity: 'search' },
  'outfit.search': { label: ACTION_COPY.searching_references, icon: 'search', botActivity: 'search' },
  'model_library.list': { label: ACTION_COPY.viewing_models },
  'outfit.propose': { label: ACTION_COPY.proposing_outfits, botActivity: 'styling' },
  'image.create': { label: ACTION_COPY.preparing_images, icon: 'create' },
  'fashion_photo.create': { label: ACTION_COPY.preparing_images, icon: 'create' },
  'photo_fission.create': { label: ACTION_COPY.preparing_images, icon: 'create' },
  'pose_fission.create': { label: ACTION_COPY.preparing_images, icon: 'create' },
  'garment_detail.create': { label: ACTION_COPY.preparing_images, icon: 'create' },
  'cutout.prepare': { label: ACTION_COPY.preparing_cutout, icon: 'scissor' },
  'task.cancel': { label: ACTION_COPY.stopping_task, icon: 'cancel' },
  'task.retry_shots': { label: ACTION_COPY.retrying_shots, icon: 'retry' },
}

const UNKNOWN_TOOL: ToolPresentation = { label: '创作步骤' }

export function toolPresentation(toolName: string): Readonly<ToolPresentation> {
  const presentation = Object.hasOwn(TOOL_PRESENTATIONS, toolName) ? TOOL_PRESENTATIONS[toolName] : undefined
  const category = actionCategoryForTool(toolName)
  return presentation && category ? { ...presentation, label: ACTION_COPY[category] } : presentation ?? UNKNOWN_TOOL
}
