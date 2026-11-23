import { z } from 'zod'
import type { StructuredContentBlock } from './structured-input'
import { PROJECT_REFERENCE_ROLES } from './types'

const assetIdSchema = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
const label = z.string().max(240)
const media = {
  label: label.optional(), maskAssetId: assetIdSchema.optional(), maskType: z.literal('brush').optional(),
  maskUrl: z.string().optional().transform(value => value && /^(data:|blob:)/.test(value) ? undefined : value), imageWidth: z.number().optional(), imageHeight: z.number().optional(),
}
export const structuredBlockSchema: z.ZodType<StructuredContentBlock> = z.union([
  z.object({ type: z.literal('text'), text: z.string().max(3600), textSource: z.enum(['input', 'quote', 'system']).optional() }),
  z.object({ type: z.literal('skill'), skillId: assetIdSchema, skillName: label }),
  z.object({ type: z.literal('kit'), kitId: z.string().min(1).max(512), kitName: label.optional() }),
  z.object({ type: z.literal('prompt_quote'), quote_text: z.string().max(3600), sourceMessageId: z.string().max(200).optional() }),
  z.object({ type: z.literal('image'), ...media, assetId: z.string().max(512), imageUrl: z.string() }),
  z.object({ type: z.literal('ref_context_item'), ...media, nodeId: z.string().max(512), label, assetId: z.string().max(512).optional(),
    imageUrl: z.string().optional(), x: z.number().optional(), y: z.number().optional(),
    role: z.enum(PROJECT_REFERENCE_ROLES).optional() }),
  z.object({ type: z.literal('preference_scale') }).catchall(z.union([z.string().max(200), z.number(), z.boolean()])),
])

export const agentContentBlockSchema = z.object({
  index: z.number().int().min(0).max(511), type: z.enum(['text', 'tool_use', 'tool_result', 'tool_event', 'image']),
  text: z.string().max(8000).optional(), name: z.string().max(200).optional(), id: z.string().max(400).optional(),
  input: z.record(z.unknown()).optional(), status: z.enum(['streaming', 'complete', 'error']).optional(),
  partialJson: z.string().max(16000).optional(), content: z.union([z.string(), z.record(z.unknown())]).optional(),
  image_url: z.string().max(4096).optional(), is_error: z.boolean().optional(),
})
