import { z } from 'zod'
import type { CanvasItem, ChatMessage, Project } from '@/lib/v2/types'

const id = z.string().min(1).max(512)
const url = z.string().min(1).max(4096).refine(value => /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value), '图片需要持久化地址')
const image = z.object({ id, url, width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(), thumbUrl: url.optional() }).strict()
const status = z.enum(['done', 'running', 'failed'])
export const canvasItemSchema: z.ZodType<CanvasItem> = z.object({
  id,
  ref: z.discriminatedUnion('type', [
    z.object({ type: z.literal('generation'), id }).strict(),
    z.object({ type: z.literal('product'), id, imageId: id }).strict(),
    z.object({ type: z.literal('material'), id }).strict(),
  ]),
  image, x: z.number().finite(), y: z.number().finite(), w: z.number().finite().positive(),
  createdAt: z.string().datetime().optional(), assetKind: z.literal('model').optional(),
  layoutSection: z.enum(['product', 'model', 'generation', 'material']).optional(),
  locked: z.boolean().optional(), parentId: id.optional(), status: status.optional(),
  parentIds: z.array(id).max(100).optional(),
  progress: z.number().finite().min(0).max(100).optional(), placeholder: image.optional(),
  generationPhase: z.enum(['queued', 'generating', 'processing', 'unconfirmed']).optional(),
  targetSize: z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() }).strict().optional(),
  estimatedDurationMs: z.number().finite().positive().optional(),
  toolRunId: id.optional(), errorMessage: z.string().max(4000).optional(), retryAllowed: z.boolean().optional(), startedAt: z.string().datetime().optional(),
}).strict()
export const chatMessageSchema: z.ZodType<ChatMessage> = z.discriminatedUnion('role', [
  z.object({ id, role: z.literal('user'), text: z.string().max(100000), createdAt: z.string().datetime(), attachments: z.array(z.object({
    kind: z.enum(['product', 'model', 'canvas', 'material', 'upload', 'brand']), id, label: z.string().max(1000), image,
  }).strict()).max(100) }).strict(),
  z.object({ id, role: z.literal('assistant'), createdAt: z.string().datetime(), body: z.string().max(200000).optional(),
    steps: z.array(z.object({ itemId: id.optional(), label: z.string().max(2000), icon: z.enum(['think', 'image', 'doc', 'tool']), progress: z.object({ done: z.number().finite().nonnegative(), total: z.number().finite().nonnegative() }).strict().optional() }).strict()).max(1000),
    results: z.array(z.object({ id, image: image.optional(), status }).strict()).max(1000),
  }).strict(),
])
const uniqueIds = <T extends { id: string }>(values: T[]) => new Set(values.map(value => value.id)).size === values.length
export const canvasItemsSchema = z.array(canvasItemSchema).max(10000).refine(uniqueIds, '画布元素 ID 重复')
export const chatMessagesSchema = z.array(chatMessageSchema).max(10000).refine(uniqueIds, '消息 ID 重复')
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), productIds: z.array(id).max(1000).optional() }).strict()
export const canvasActionSchema = z.object({ itemId: id }).strict()
export const renameProjectSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict()
export const saveCanvasSchema = z.object({ items: canvasItemsSchema, messages: chatMessagesSchema.optional() }).strict()
export const projectSchema: z.ZodType<Project> = z.object({ id: z.string().uuid(), name: z.string().min(1).max(120), cover: image.optional(), coverItemId: id.optional(), productIds: z.array(id), updatedAt: z.string().datetime() }).strict()
export const projectDocumentSchema = z.object({ project: projectSchema, items: canvasItemsSchema, messages: chatMessagesSchema }).strict()
export type ProjectDocument = z.infer<typeof projectDocumentSchema>
export const projectFileSchema = z.object({ version: z.literal(1), userId: z.string().min(1), projects: z.array(projectDocumentSchema) }).strict()
