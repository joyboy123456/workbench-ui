import { z } from 'zod'
import type { AgentChatSnapshot } from '@/lib/v2/agent-chat-contract'
import { publicAgentText } from './public-progress'

const identity = { message_id: z.string().min(1).max(200), step_id: z.string().min(1).max(400) }
const finishReason = z.enum(['completed', 'waiting_input', 'aborted', 'interrupted'])
const phase = z.enum(['streaming', 'done', 'aborted', 'interrupted'])
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('text.delta'), delta: z.string().max(8000), offset: z.number().int().min(0).max(8000) }),
  z.object({ ...identity, type: z.literal('text.stop'), phase, fallback: z.boolean().optional() }),
  z.object({ ...identity, type: z.literal('tool_use.start'), tool_name: z.string().max(200), label: z.string().max(200) }),
  z.object({ ...identity, type: z.literal('tool_use.finish'), tool_name: z.string().max(200), label: z.string().max(200), failed: z.boolean() }),
  z.object({ ...identity, type: z.literal('generator.init'), generator_name: z.string().max(200) }),
  z.object({ ...identity, type: z.literal('generator.artifacts'), generator_name: z.string().max(200) }),
  z.object({ ...identity, type: z.literal('generator.error'), generator_name: z.string().max(200) }),
  z.object({ type: z.literal('session.finish'), message_id: z.string().min(1).max(200), reason: finishReason }),
])
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>
const cursor = z.object({ epoch: z.string().uuid(), sequence: z.number().int().nonnegative() })
export const chatStreamFrameSchema = z.object({ ...cursor.shape, occurred_at: z.string().datetime(), event: chatStreamEventSchema })
export type ChatStreamFrame = z.infer<typeof chatStreamFrameSchema>
export interface ChatStreamBlock {
  message_id: string
  step_id: string
  kind: 'text' | 'tool' | 'generator'
  phase: z.infer<typeof phase>
  text: string
  label?: string
  failed?: boolean
  fallback?: boolean
}
export interface ChatStreamCheckpoint {
  epoch: string
  sequence: number
  blocks: ChatStreamBlock[]
  finished: Record<string, z.infer<typeof finishReason>>
}
const blockSchema = z.object({ ...identity, kind: z.enum(['text', 'tool', 'generator']), phase, text: z.string().max(8000),
  label: z.string().max(200).optional(), failed: z.boolean().optional(), fallback: z.boolean().optional() })
export const chatStreamCheckpointSchema = z.object({ ...cursor.shape, blocks: z.array(blockSchema).max(500),
  finished: z.record(finishReason) })

export function parseChatStreamFrame(data: string): ChatStreamFrame | undefined {
  try { const result = chatStreamFrameSchema.safeParse(JSON.parse(data)); return result.success ? result.data : undefined } catch { return undefined }
}

/** Transient display only. Settled receipts and admitted images always come from the snapshot. */
export class ChatStreamProjection {
  private state: ChatStreamCheckpoint = { epoch: '', sequence: 0, blocks: [], finished: {} }
  checkpoint(): ChatStreamCheckpoint { return structuredClone(this.state) }
  get cursor(): string | undefined { return this.state.epoch ? `${this.state.epoch}:${this.state.sequence}` : undefined }

  reset(checkpoint: ChatStreamCheckpoint): boolean {
    if (checkpoint.epoch === this.state.epoch && checkpoint.sequence < this.state.sequence) return false
    this.state = structuredClone(checkpoint)
    return true
  }

  accept(frame: ChatStreamFrame): 'applied' | 'duplicate' | 'gap' {
    if (this.state.epoch && frame.epoch !== this.state.epoch) return 'gap'
    if (frame.sequence <= this.state.sequence) return 'duplicate'
    if (frame.sequence !== this.state.sequence + 1) return 'gap'
    const event = frame.event
    let block = 'step_id' in event ? this.state.blocks.find(item => item.step_id === event.step_id && item.message_id === event.message_id) : undefined
    if (event.type === 'text.delta' && event.offset !== (block?.text.length ?? 0)) return 'gap'
    this.state.epoch = frame.epoch
    this.state.sequence = frame.sequence
    if (event.type === 'session.finish') {
      this.state.finished[event.message_id] = event.reason
      for (const item of this.state.blocks) if (item.message_id === event.message_id && item.phase === 'streaming') {
        item.phase = event.reason === 'aborted' ? 'aborted' : 'interrupted'
      }
      return 'applied'
    }
    if (!block) {
      block = { message_id: event.message_id, step_id: event.step_id, kind: event.type.startsWith('text.') ? 'text' : event.type.startsWith('tool_use.') ? 'tool' : 'generator', phase: 'streaming', text: '' }
      this.state.blocks.push(block)
      if (this.state.blocks.length > 500) this.state.blocks.shift()
    }
    if (event.type === 'text.delta') { block.text += event.delta; block.phase = 'streaming' }
    else if (event.type === 'text.stop') { block.phase = event.phase; block.fallback = event.fallback }
    else if (event.type === 'tool_use.start' || event.type === 'tool_use.finish') {
      block.label = event.label || event.tool_name
      block.phase = event.type === 'tool_use.start' ? 'streaming' : 'done'
      block.failed = event.type === 'tool_use.finish' && event.failed
    } else { block.label = event.generator_name; block.phase = event.type === 'generator.init' ? 'streaming' : 'done'; block.failed = event.type === 'generator.error' }
    return 'applied'
  }

  project(snapshot: AgentChatSnapshot, connected = true): AgentChatSnapshot {
    return { ...snapshot, messages: snapshot.messages.map(message => {
      if (message.role !== 'assistant') return message
      const blocks = this.state.blocks.filter(block => block.message_id === message.id)
      const text = blocks.findLast(block => block.kind === 'text')
      const settled = snapshot.receipts.some(receipt => receipt.state === 'settled' && receipt.runId === message.id)
      const live = !settled
      const source = Boolean(text?.text && !text.fallback)
      const tools = live ? blocks.filter(block => block.kind === 'tool').map(block => ({
        streamStepId: block.step_id, icon: 'tool' as const, label: block.label ?? '',
        status: block.phase === 'streaming' ? 'running' as const : block.failed ? 'failed' as const : 'done' as const,
      })) : []
      return { ...message, streaming: Boolean(connected && live && !this.state.finished[message.id] && source && text?.phase === 'streaming'),
        textSource: source ? 'sse' as const : 'snapshot' as const,
        ...(live && source && text ? { body: publicAgentText(text.text) } : {}),
        steps: [...message.steps, ...tools],
      }
    }) }
  }
}
