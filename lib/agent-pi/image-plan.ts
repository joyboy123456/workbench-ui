import { z } from 'zod'
import type { AgentBetaSettings } from '@/lib/agent-beta/types'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/)
const references = z.array(id).max(10).refine(ids => new Set(ids).size === ids.length, '参考图不能重复')
const prompt = z.string().trim().min(1).max(8000)
const revision = z.number().int().positive().safe()
const status = z.enum(['draft', 'confirmed', 'cancelled', 'superseded'])

const generation = z.object({ modelId: z.string().max(200), ratio: z.string().max(32), resolution: z.string().max(32), count: z.number().int().min(1).max(10) }).strict()
const toolId = z.union([z.literal(80231), z.literal(80232), z.literal(80253)])
export type PlanToolId = z.infer<typeof toolId>
export function isPlanTool(id: number | undefined): id is PlanToolId { return id === 80231 || id === 80232 || id === 80253 }

const options = z.object({
  frames: z.union([z.literal(4), z.literal(6), z.literal(9)]).optional(),
  frameMs: z.number().int().min(100).max(500).optional(),
  screenCount: z.number().int().min(1).max(10).optional(),
}).strict()
export type PlanToolOptions = z.infer<typeof options>
const roleSchema = z.object({ key: id, label: z.string().max(80), min: z.number().int().nonnegative(), max: z.number().int().positive() }).strict()
const toolView = z.object({ toolId, options, roles: z.array(roleSchema).min(1).max(3), parametersLabel: z.string().max(1200) }).strict()
const specialistPlan = toolView.extend({
  capabilityId: id, version: z.string().min(1).max(40), digest: z.string().regex(/^[a-f0-9]{64}$/),
  bindings: z.array(z.object({ role: id, label: z.string().max(80), nodeId: id, assetId: id }).strict()).min(1).max(10),
  parameters: z.record(z.union([z.string(), z.number(), z.array(z.string())])), generation,
}).strict()
export type SpecialistPlan = z.infer<typeof specialistPlan>

export const piImagePlanDraftSchema = z.object({ title: z.string().trim().min(1).max(120), prompt, referenceNodeIds: references, specialist: specialistPlan.optional() }).strict()
export const piImagePlanTargetSchema = z.object({ runId: id, revision }).strict()
export const piImagePlanCommandSchema = z.discriminatedUnion('action', [
  piImagePlanTargetSchema.extend({ action: z.literal('save'), prompt, referenceAssetIds: references, referenceRoles: z.array(id).max(10).optional(), options: options.optional() }),
  piImagePlanTargetSchema.extend({ action: z.literal('confirm') }),
  piImagePlanTargetSchema.extend({ action: z.literal('cancel') }),
])
export type PiImagePlanCommand = z.infer<typeof piImagePlanCommandSchema>
export type PiImagePlanTarget = z.infer<typeof piImagePlanTargetSchema>
export type PiImagePlanDraft = z.infer<typeof piImagePlanDraftSchema>
export type PiImagePlan = PiImagePlanDraft & { revision: number; status: z.infer<typeof status>; settings: AgentBetaSettings }

export const piImagePlanViewSchema = z.object({
  runId: id, revision, status, title: piImagePlanDraftSchema.shape.title, prompt,
  generation, specialist: toolView.optional(),
  unavailableReferenceCount: z.number().int().min(0).max(10),
  references: z.array(z.object({ assetId: id, label: z.string().max(300), role: id.optional(), roleLabel: z.string().max(80).optional(), image: z.object({
    id, url: z.string().min(1).max(4096).refine(value => /^https?:\/\//.test(value) || /^\/(?!\/)/.test(value)),
    width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(),
  }).strict() }).strict()).max(10),
}).strict()
export type PiImagePlanView = z.infer<typeof piImagePlanViewSchema>
