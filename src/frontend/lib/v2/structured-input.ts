import type { ComposerGeneration } from './composer-options'
import type { AgentMode, CanvasItem, ChatAttachment, ProjectReferenceRole } from './types'

export interface TextContentBlock {
  type: 'text'
  text: string
  textSource?: 'input' | 'quote' | 'system'
}

export interface ImageContentBlock {
  type: 'image'
  assetId: string
  imageUrl: string
  imageWidth?: number
  imageHeight?: number
  label?: string
  maskAssetId?: string
  maskUrl?: string
  maskType?: 'brush'
}

export interface RefContextItemBlock {
  type: 'ref_context_item'
  nodeId: string
  assetId?: string
  label: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  x?: number
  y?: number
  role?: ProjectReferenceRole
  maskAssetId?: string
  maskUrl?: string
  maskType?: 'brush'
}

export interface SkillContentBlock {
  type: 'skill'
  skillId: string
  skillName: string
}

export interface KitContentBlock {
  type: 'kit'
  kitId: string
  kitName?: string
}

export interface PromptQuoteContentBlock {
  type: 'prompt_quote'
  quote_text: string
  sourceMessageId?: string
}

export interface PreferenceScaleContentBlock {
  type: 'preference_scale'
  [key: string]: string | number | boolean | undefined
}

export type StructuredContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | RefContextItemBlock
  | SkillContentBlock
  | KitContentBlock
  | PromptQuoteContentBlock
  | PreferenceScaleContentBlock

export interface CanvasContextNode {
  id: string
  assetId: string
  label: string
  x: number
  y: number
  width: number
  height: number
  selected: boolean
  mediaType?: 'image' | 'video'
  status?: CanvasItem['status']
}

export interface CanvasContextSnapshot {
  projectId: string
  totalNodes: number
  selectedIds: string[]
  nodes: CanvasContextNode[]
  viewport?: { x: number; y: number; zoom: number }
}

export interface AgentMessageExtra {
  canvas_context?: CanvasContextSnapshot
}

export interface ComposerSkillSelection {
  id: string
  name: string
}

export interface ComposerPromptQuote {
  text: string
  sourceMessageId?: string
}

export interface BuildStructuredContentsInput {
  text: string
  mode: AgentMode
  attachments: ChatAttachment[]
  canvasItems?: CanvasItem[]
  generation?: ComposerGeneration
  skill?: ComposerSkillSelection | null
  promptQuote?: ComposerPromptQuote | null
}

const MAX_CONTEXT_NODES = 48

export function buildCanvasContext(
  projectId: string,
  items: CanvasItem[],
  selectedIds: readonly string[],
  viewport?: { x: number; y: number; zoom: number },
): CanvasContextSnapshot {
  const selectedSet = new Set(selectedIds)
  const prioritized = [
    ...items.filter(item => selectedSet.has(item.id)),
    ...items.filter(item => !selectedSet.has(item.id)),
  ].slice(0, MAX_CONTEXT_NODES)

  return {
    projectId,
    totalNodes: items.length,
    selectedIds: [...selectedIds],
    nodes: prioritized.map(item => {
      const size = item.targetSize ?? item.image
      const height = size.width > 0 ? Math.round((item.w * size.height) / size.width) : Math.round(item.w)
      return {
        id: item.id,
        assetId: item.image.id,
        label: item.ref.type,
        x: Math.round(item.x),
        y: Math.round(item.y),
        width: Math.round(item.w),
        height,
        selected: selectedSet.has(item.id),
        mediaType: item.mediaType ?? 'image',
        status: item.status,
      }
    }),
    ...(viewport ? { viewport: { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) } } : {}),
  }
}

function buildPreferenceScale(mode: AgentMode, generation?: ComposerGeneration): PreferenceScaleContentBlock | null {
  if (!generation) return null
  const prefix = mode === 'video' ? 'video' : 'image'
  const scale: PreferenceScaleContentBlock = { type: 'preference_scale' }
  let hasField = false
  const entries: Array<[string, string | number | boolean | undefined]> = [
    [`${prefix}_model_id`, generation.modelId],
    [`${prefix}_ratio`, generation.ratio],
    [`${prefix}_resolution`, generation.resolution],
    [`${prefix}_count`, generation.count],
    [`${prefix}_ratio_auto`, generation.ratioAuto],
    [`${prefix}_count_auto`, generation.countAuto],
    ['video_duration', 'duration' in generation ? (generation as { duration?: number }).duration : undefined],
  ]
  for (const [key, value] of entries) {
    if (value !== undefined && value !== '') {
      scale[key] = value
      hasField = true
    }
  }
  return hasField ? scale : null
}

function toAttachmentBlock(
  attachment: ChatAttachment,
  canvasById: Map<string, CanvasItem>,
): StructuredContentBlock {
  const maskFields = attachment.mask
    ? {
        ...(attachment.mask.assetId ? { maskAssetId: attachment.mask.assetId } : {}),
        maskUrl: attachment.mask.url,
        maskType: attachment.mask.type,
      }
    : {}

  if (attachment.kind === 'brand') {
    return {
      type: 'kit',
      kitId: attachment.id,
      kitName: attachment.label,
    }
  }

  if (attachment.kind === 'canvas') {
    const node = canvasById.get(attachment.id)
    return {
      type: 'ref_context_item',
      nodeId: attachment.id,
      assetId: attachment.image.id,
      label: attachment.label,
      imageUrl: attachment.image.url,
      imageWidth: attachment.image.width,
      imageHeight: attachment.image.height,
      ...(node ? { x: Math.round(node.x), y: Math.round(node.y) } : {}),
      ...maskFields,
    }
  }

  return {
    type: 'image',
    assetId: attachment.image.id,
    imageUrl: attachment.image.url,
    imageWidth: attachment.image.width,
    imageHeight: attachment.image.height,
    label: attachment.label,
    ...maskFields,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildStructuredContents(input: BuildStructuredContentsInput): StructuredContentBlock[] {
  const blocks: StructuredContentBlock[] = []
  const canvasById = new Map((input.canvasItems ?? []).map(item => [item.id, item]))

  if (input.promptQuote?.text.trim()) {
    blocks.push({
      type: 'prompt_quote',
      quote_text: input.promptQuote.text.trim(),
      ...(input.promptQuote.sourceMessageId ? { sourceMessageId: input.promptQuote.sourceMessageId } : {}),
    })
  }

  const trimmed = input.text.trim()
  const referencedIds = new Set<string>()
  const mentionable = input.attachments.filter(a => a.label.trim().length > 0)

  if (trimmed && mentionable.length > 0) {
    const sorted = [...mentionable].sort((a, b) => b.label.length - a.label.length)
    const pattern = new RegExp(`@(${sorted.map(a => escapeRegExp(a.label)).join('|')})`, 'g')
    let cursor = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(trimmed)) !== null) {
      const before = trimmed.slice(cursor, match.index).trim()
      if (before) blocks.push({ type: 'text', text: before, textSource: 'input' })
      const matchedLabel = match[1]
      const attachment = sorted.find(a => a.label === matchedLabel)
      if (attachment) {
        referencedIds.add(`${attachment.kind}:${attachment.id}`)
        blocks.push(toAttachmentBlock(attachment, canvasById))
      }
      cursor = match.index + match[0].length
    }
    const tail = trimmed.slice(cursor).trim()
    if (tail) blocks.push({ type: 'text', text: tail, textSource: 'input' })
  } else if (trimmed) {
    blocks.push({ type: 'text', text: trimmed, textSource: 'input' })
  }

  for (const attachment of input.attachments) {
    if (referencedIds.has(`${attachment.kind}:${attachment.id}`)) continue
    blocks.push(toAttachmentBlock(attachment, canvasById))
  }

  if (input.skill?.id) {
    blocks.push({
      type: 'skill',
      skillId: input.skill.id,
      skillName: input.skill.name,
    })
  }

  const preference = buildPreferenceScale(input.mode, input.generation)
  if (preference) blocks.push(preference)

  return blocks
}
