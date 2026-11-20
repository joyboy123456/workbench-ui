import { z } from 'zod'
import { OUTFIT_ROLES } from './outfit'
import type { OutfitPrimaryRecognition } from './outfit'

export type ReferenceMatchProfile = Pick<OutfitPrimaryRecognition, 'assetId' | 'category' | 'colors' | 'description' | 'confidence' | 'features' | 'categorySource'>

export type ReferenceSearchMode = 'shop' | 'web'

export const OUTFIT_SOURCE_POLICY = 'search-or-provided-v1' as const
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
const url = z.string().url().max(2000).refine(value => /^https?:\/\//.test(value))
export const outfitReferenceSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project'), assetId: id }).strict(),
  z.object({ kind: z.literal('web'), assetId: id, provider: z.literal('firecrawl'),
    title: z.string().max(200), sourceUrl: url, imageUrl: url,
    fetchedAt: z.string().datetime(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    evidence: z.literal('ordinary_reference'), sourceBinding: z.literal('search_index'),
  }).strict(),
])
export type OutfitReferenceSource = z.infer<typeof outfitReferenceSourceSchema>
/** Frozen, source-bound visual decisions; garment identity still belongs to its original. */
export const outfitVisualDirectionSchema = z.object({
  version: z.literal('designer-look-v1'),
  framing: z.literal('full_body'),
  proportions: z.string().trim().min(1).max(300),
  hairAndExpression: z.string().trim().min(1).max(300),
  photography: z.string().trim().min(1).max(300),
}).strict()
export const lookReferenceSchema = z.object({
  source: outfitReferenceSourceSchema,
  roles: z.array(z.enum(OUTFIT_ROLES)).min(1).max(7)
    .refine(roles => !roles.includes('primary') && new Set(roles).size === roles.length),
  description: z.string().trim().min(1).max(1000),
  pose: z.string().trim().min(1).max(600).optional(),
  visualDirection: outfitVisualDirectionSchema.optional(),
  reusePolicy: z.literal('replace-primary-v1').optional(),
}).strict()
export type OutfitLookReference = z.infer<typeof lookReferenceSchema>

/** 角色由理解阶段提出，服务端仍核对用户原话和本轮原始引用序号。 */
export const outfitSourcePlanSchema = z.object({
  mode: z.enum(['search', 'provided']),
  bindings: z.array(z.object({ assetId: id,
    role: z.enum([...OUTFIT_ROLES, 'model', 'look', 'pose', 'primary_detail', 'hero'])
      .transform(role => role === 'hero' ? 'primary' as const : role),
    quote: z.string().trim().min(1).max(1000),
  }).strict()).max(10),
}).strict()
export type OutfitSourcePlan = z.infer<typeof outfitSourcePlanSchema>
export interface OutfitSearchCandidate { source: OutfitReferenceSource; assetDigest: string }
/** Pixel observations, not style suggestions or human aesthetic acceptance. */
export const referenceObservationSchema = z.object({
  version: z.literal('visible-outfit-v1'), sourceImageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  view: z.enum(['worn', 'flat_lay', 'collage', 'unknown']),
  pieces: z.array(z.object({ role: z.enum(OUTFIT_ROLES).refine(role => role !== 'primary'),
    description: z.string().trim().min(1).max(100) }).strict()).max(7)
    .refine(pieces => new Set(pieces.map(piece => piece.role)).size === pieces.length),
  pose: z.string().trim().max(300).optional(),
  visualDirection: outfitVisualDirectionSchema.optional(),
  reusePolicy: z.literal('replace-primary-v1').optional(),
}).strict()
export const boundReferenceObservationSchema = referenceObservationSchema.extend({ assetDigest: z.string().regex(/^[a-f0-9]{64}$/) })
export type ReferenceObservation = z.infer<typeof referenceObservationSchema>
export interface ReferenceCopyEvidence {
  selectionPolicy?: 'approved-case-demo-v1'
  referencePolicy?: 'copy-observed-v1'
  referenceObservations?: Record<string, z.infer<typeof boundReferenceObservationSchema>>
}
export interface OutfitSearchResult {
  toolName: 'outfit.search'
  status: 'ready' | 'empty' | 'unavailable' | 'budget_exceeded' | 'interrupted'
  candidates: OutfitSearchCandidate[]
  visualReferences: { assetId: string; assetDigest: string }[]
  result: string
  referencePolicy?: ReferenceCopyEvidence['referencePolicy']
  referenceObservations?: ReferenceCopyEvidence['referenceObservations']
}
