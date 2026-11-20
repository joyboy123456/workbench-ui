import { agentRetryTargetSchema } from '@/lib/agent/retry'
import { clarificationSchema, clarificationContextSchema } from '@/lib/agent/clarification'
import { piImagePlanViewSchema } from '@/lib/agent-pi/image-plan'
import { z } from 'zod'
import { agentModeSchema } from './agent-mode'
import { videoMediaSchema } from './video-options'
import { chatErrorSchema } from './chat-error'
import type { CanvasItem, ChatMessage, Project } from '@/lib/v2/types'

const id = z.string().min(1).max(512)
const url = z.string().min(1).max(4096).refine(value => /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value), '图片需要持久化地址')
const image = z.object({ id, url, width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(), thumbUrl: url.optional() }).strict()
const status = z.enum(['done', 'running', 'failed'])
export const canvasItemSchema: z.ZodType<CanvasItem> = z.object({
  id, mediaType: z.literal('video').optional(), video: videoMediaSchema.optional(),
  ref: z.discriminatedUnion('type', [
    z.object({ type: z.literal('generation'), id }).strict(),
    z.object({ type: z.literal('product'), id, imageId: id }).strict(),
    z.object({ type: z.literal('material'), id }).strict(),
  ]),
  image, x: z.number().finite(), y: z.number().finite(), w: z.number().finite().positive(),
  createdAt: z.string().datetime().optional(), assetKind: z.literal('model').optional(),
  layoutSection: z.enum(['product', 'model', 'generation', 'material']).optional(),
  locked: z.boolean().optional(), resolutionLocked: z.boolean().optional(), aspectRatioLocked: z.boolean().optional(), parentId: id.optional(), status: status.optional(),
  parentIds: z.array(id).max(100).optional(),
  progress: z.number().finite().min(0).max(100).optional(), placeholder: image.optional(),
  generationPhase: z.enum(['queued', 'generating', 'processing', 'unconfirmed']).optional(),
  targetSize: z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() }).strict().optional(),
  estimatedDurationMs: z.number().finite().positive().optional(),
  agentRetry: agentRetryTargetSchema.optional(),
  agentOrigin: z.object({ runId: id, taskId: id, slotId: id, slotIndex: z.number().int().positive(), attemptNumber: z.number().int().positive() }).strict().optional(),
  toolRunId: id.optional(), errorMessage: z.string().max(4000).optional(), retryAllowed: z.boolean().optional(), startedAt: z.string().datetime().optional(),
}).strict()
const askFields = {
  question: z.string().max(2000),
  options: z.array(z.object({ key: z.string().max(16), label: z.string().max(500), description: z.string().max(1000).optional() }).strict()).max(10),
  otherPlaceholder: z.string().max(500).optional(),
}
const messageAttachments = z.array(z.object({
    kind: z.enum(['product', 'model', 'canvas', 'material', 'upload', 'brand']), id, label: z.string().max(1000), image,
  }).strict()).max(100)
const userMessageSchema = z.object({ mode: agentModeSchema.optional(),
    generation: z.object({ modelId: z.string().min(1).max(200), ratio: z.string().min(1).max(32),
      resolution: z.string().min(1).max(32), count: z.number().int().min(1).max(10),
      duration: z.union([z.literal(6), z.literal(10), z.literal(15)]).optional(),
      ratioAuto: z.boolean().optional(), countAuto: z.boolean().optional() }).strict().optional(),
    clarificationResponse: clarificationContextSchema.optional(),
    id, role: z.literal('user'), text: z.string().max(100000), createdAt: z.string().datetime(), attachments: messageAttachments, appliedReferences: messageAttachments.optional() }).strict()
export const chatMessageSchema: z.ZodType<ChatMessage, z.ZodTypeDef, unknown> = z.discriminatedUnion('role', [
  userMessageSchema,
  z.object({ id, role: z.literal('assistant'), createdAt: z.string().datetime(), body: z.string().max(200000).optional(),
    imagePlan: piImagePlanViewSchema.optional(),
    canInspectRun: z.boolean().optional(),
    failure: chatErrorSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    streaming: z.boolean().optional(), textSource: z.enum(['sse', 'snapshot']).optional(), retryable: z.boolean().optional(),
    meta: z.object({
      modelName: z.string().max(200).optional(),
      outputCount: z.number().int().positive().optional(),
      referencePlan: z.string().max(2000).optional(),
      droppedReferenceIds: z.array(id).max(100).optional(),
      spec: z.string().max(500).optional(),
      risks: z.array(z.string().max(500)).max(20).optional(),
      highlights: z.array(z.string().max(500)).max(50).optional(),
      suggestions: z.array(z.string().max(500)).max(20).optional(),
    }).strict().optional(),
    steps: z.array(z.object({
      streamStepId: z.string().max(400).optional(),
      itemId: id.optional(),
      label: z.string().max(2000),
      icon: z.enum(['think', 'image', 'doc', 'tool']),
      status: z.enum(['running', 'done', 'failed']).optional(),
      detail: z.string().max(10000).optional(),
      collapsible: z.boolean().optional(),
      progress: z.object({ done: z.number().finite().nonnegative(), total: z.number().finite().nonnegative() }).strict().optional(),
    }).strict()).max(1000),
    results: z.array(z.object({
      id, video: videoMediaSchema.optional(),
      image: image.optional(),
      status,
      itemId: id.optional(),
      ratio: z.string().max(32).optional(),
      targetSize: z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() }).strict().optional(),
      progress: z.number().finite().min(0).max(100).optional(),
      generationPhase: z.enum(['queued', 'generating', 'processing', 'unconfirmed']).optional(),
    }).strict()).max(1000),
  }).strict(),
  z.object({
    clarification: clarificationSchema.optional(),
    id, role: z.literal('ask'), createdAt: z.string().datetime(),
    title: z.string().trim().min(1).max(120).optional(),
    reason: z.string().max(2000).optional(),
    ...askFields,
    questions: z.array(z.object({ ...askFields, mode: z.enum(['single', 'multiple']).optional() }).strict()).max(100).optional(),
    answered: z.object({ selectedKey: z.string().max(3600), answerText: z.string().max(3600) }).strict().optional(),
    skipped: z.boolean().optional(),
  }).strict(),
])
const uniqueIds = <T extends { id: string }>(values: T[]) => new Set(values.map(value => value.id)).size === values.length
export const canvasItemsSchema = z.array(canvasItemSchema).max(10000).refine(uniqueIds, '画布元素 ID 重复')
export const chatMessagesSchema = z.array(chatMessageSchema).max(10000).refine(uniqueIds, '消息 ID 重复')
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), productIds: z.array(id).max(1000).optional(), firstMessage: userMessageSchema.omit({ appliedReferences: true }).extend({ id: z.string().uuid() }).optional() }).strict()
export const canvasActionSchema = z.object({ itemId: id }).strict()
export const renameProjectSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict()
export const saveCanvasSchema = z.object({ items: canvasItemsSchema, messages: chatMessagesSchema.optional() }).strict()
export const saveMessagesSchema = z.object({ messages: chatMessagesSchema }).strict()
export const curtainPatchSchema = z.object({
  upsert: canvasItemsSchema.optional(),
  removeIds: z.array(id).max(10000).refine(values => new Set(values).size === values.length, '删除元素 ID 重复').optional(),
  orderIds: z.array(id).max(10000).refine(values => new Set(values).size === values.length, '排序元素 ID 重复').optional(),
}).strict().refine(value => Boolean(value.upsert?.length || value.removeIds?.length || value.orderIds?.length), '至少提交一项幕布变更')
export type CurtainPatch = z.infer<typeof curtainPatchSchema>
export const projectSchema: z.ZodType<Project> = z.object({ id: z.string().uuid(), name: z.string().min(1).max(120), nameSource: z.enum(['automatic', 'manual']).optional(), cover: image.optional(), coverItemId: id.optional(), productIds: z.array(id), updatedAt: z.string().datetime() }).strict()
export const projectDocumentSchema = z.object({
  project: projectSchema,
  creation: z.object({ messageId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  items: canvasItemsSchema,
  messages: chatMessagesSchema,
  removedItemIds: z.array(id).max(10000).optional(),
}).strict()
export type ProjectDocument = z.infer<typeof projectDocumentSchema>
export const projectFileSchema = z.object({ version: z.literal(1), userId: z.string().min(1), projects: z.array(projectDocumentSchema) }).strict()
