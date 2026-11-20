import type { ComposerGeneration } from './composer-options'
import type { AgentMode } from './types'
import { replayParameters } from './generation-history'
import { parentIds } from './provenance'
import { usableImage } from './selection-actions'
import type { CanvasItem, ChatAttachment, ChatMessage, Generation, ToolParams } from './types'

/** G2 projects replayParams into Generation.params. The optional field also
 * accepts an already loaded run snapshot without changing the shared model. */
export type RegenerationRecord = Partial<Generation> & {
  replayParams?: ToolParams
  attachments?: ChatAttachment[]
}

export type RegenerationPlan =
  | { kind: 'tool'; toolId: string; sourceIds: string[]; params: ToolParams }
  | { kind: 'chat'; text: string; attachments: ChatAttachment[]; mode?: AgentMode; generation?: Partial<ComposerGeneration>; notice?: string }
  | { kind: 'unavailable'; reason: string }

export function regeneratePlan(item: CanvasItem, items: CanvasItem[], generation?: RegenerationRecord): RegenerationPlan {
  const unavailable = (reason: string): RegenerationPlan => ({ kind: 'unavailable', reason })
  if (item.ref.type !== 'generation' || !usableImage(item)) return unavailable('请选择已完成的生成结果')
  // An explicitly empty parentIds is authoritative, as in G4. Only snapshots
  // with neither canvas field may fall back to history asset/reference IDs.
  const sources = item.parentIds !== undefined || item.parentId !== undefined
    ? parentIds(item)
    : [...new Set(generation?.parentIds ?? (generation?.parentId ? [generation.parentId] : []))].map(id =>
      items.find(source => source.id === id || source.ref.id === id || source.image.id === id)?.id ?? id)
  if (sources.some(id => !items.some(source => source.id === id && usableImage(source)))) return unavailable('来源图片已删除')

  if (generation?.source !== 'agent' && generation?.toolId) {
    if (!sources.length) return unavailable('未记录来源图片')
    return { kind: 'tool', toolId: generation.toolId, sourceIds: sources, params: replayParameters(generation.replayParams ?? generation.params ?? {}) }
  }
  if (generation?.source !== 'agent' && !generation?.attachments) return unavailable('未记录生成方式')
  const text = generation.prompt ?? (typeof generation.params?.prompt === 'string' ? generation.params.prompt : '')
  if (!text.trim()) return unavailable('未记录提示词')
  const parents = sources.map<ChatAttachment>((id, index) => {
    const source = items.find(source => source.id === id)!
    return { kind: 'canvas', id, label: `图 ${index + 1}`, image: source.image }
  })
  // A recovered user turn may contain only a subset of the original references.
  // Combine its named/library inputs with the output's recorded ancestry.
  const attachments = [...(generation.attachments ?? []), ...parents]
  const stable: ChatAttachment[] = []
  let lostReference = false
  for (const attachment of attachments) {
    const source = attachment.kind === 'canvas' ? items.find(source => source.id === attachment.id)
      : items.find(source => source.id !== item.id && usableImage(source) && source.image.id === attachment.image.id)
    if (attachment.kind === 'canvas' && (!source || !usableImage(source))) return unavailable('来源图片已删除')
    const image = source?.image ?? attachment.image
    // The canvas owns the current URL, including mock uploads rehydrated from
    // IndexedDB. Only orphan transient URLs lack a reusable owner.
    if (!source && /^(blob:|data:)/i.test(image.url)) { lostReference = true; continue }
    if (stable.some(existing => existing.image.id === image.id)) continue
    stable.push({ ...attachment, image: { ...image } })
  }
  return { kind: 'chat', text, attachments: stable,
    ...(generation.mode ? { mode: generation.mode } : {}),
    ...(generation.generation ? { generation: generation.generation } : generation.outputCount ? { generation: { count: generation.outputCount } } : {}), ...(lostReference ? { notice: '部分引用已失效，请重新添加后再生成' } : {}) }
}

/** Prefer the actual user turn over a provider-expanded prompt. A tool record
 * stays a tool even when its output also appears in a chat message. */
export function regenerationRecord(item: CanvasItem, messages: ChatMessage[], generation?: RegenerationRecord): RegenerationRecord | undefined {
  if (generation?.toolId && generation.source !== 'agent') return generation
  const index = messages.findIndex(message => message.role === 'assistant' && message.results.some(result =>
    result.id === item.ref.id || result.id === item.id || result.id === item.image.id))
  if (index < 0) return generation
  // A standalone tool message may follow an unrelated chat turn. Without a
  // recorded agent identity, do not attach that older user's request to it.
  // B 的分段回复会在用户消息和结果消息之间插入一条只有工作步骤的同轮前导消息
  // （画布读取/思考/使用模型，无结果、无逐张 itemId）；跳过它再判断上一条是否为用户。
  // 没有任何步骤的空回复仍视为无关轮次，原有防串轮保护不变。
  let previous = index - 1
  while (previous >= 0 && isTurnPreamble(messages[previous])) previous--
  if (generation?.source !== 'agent' && messages[previous]?.role !== 'user' && item.toolRunId !== messages[index].id) return generation
  const user = messages.slice(0, index).reverse().find(message => message.role === 'user')
  if (!user || user.role !== 'user') return generation
  if (!generation && user.text.trimStart().startsWith('/')) return undefined
  return { ...generation, source: 'agent', prompt: user.text, attachments: user.attachments,
    ...(user.mode ? { mode: user.mode } : {}), ...(user.generation ? { generation: user.generation } : {}) }
}

function isTurnPreamble(message: ChatMessage): boolean {
  return message.role === 'assistant' && !message.results.length && message.steps.length > 0 && message.steps.every(step => !step.itemId)
}

export function regenerationNotice(plan: RegenerationPlan): string | undefined {
  if (plan.kind === 'unavailable') return plan.reason
  if (plan.kind === 'chat') return plan.notice
  if (plan.kind === 'tool' && !Object.keys(plan.params).length) return '未记录参数，将使用默认参数'
}
