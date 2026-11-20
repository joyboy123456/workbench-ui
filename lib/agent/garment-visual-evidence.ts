import { z } from 'zod'
import { GARMENT_CATEGORIES } from './outfit'

/** Observations describe source pixels, never a desired styling outcome or permission to use a source. */
export const GARMENT_VISUAL_EVIDENCE_VERSION = 'garment-visual-evidence-v1' as const
export const visualObservationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('observed'), description: z.string().trim().min(1).max(120) }).strict(),
  z.object({ status: z.literal('uncertain'), description: z.string().trim().min(1).max(120) }).strict(),
  z.object({ status: z.literal('unknown') }).strict(),
])
export const VISUAL_ATTRIBUTE_KEYS = [
  'colorAppearance', 'silhouette', 'proportions', 'surfaceAppearance', 'designDetails', 'wornDrape',
] as const
const pieceSchema = z.object({
  key: z.string().regex(/^p[1-6]$/),
  category: z.enum(GARMENT_CATEGORIES),
  colorAppearance: visualObservationSchema,
  silhouette: visualObservationSchema,
  proportions: visualObservationSchema,
  surfaceAppearance: visualObservationSchema,
  designDetails: visualObservationSchema,
  wornDrape: visualObservationSchema,
}).strict()
export const garmentVisualEvidenceSchema = z.object({
  version: z.literal(GARMENT_VISUAL_EVIDENCE_VERSION),
  kind: z.enum(['single_garment', 'outfit', 'unknown']),
  view: z.enum(['flat_lay', 'worn', 'detail', 'unknown']),
  pieces: z.array(pieceSchema).max(6),
  relations: z.array(z.object({
    kind: z.enum(['top_hem_to_body', 'trouser_hem_to_shoe', 'layer_exposure', 'volume_balance']),
    subjects: z.array(z.string().regex(/^p[1-6]$/)).min(1).max(2),
    observation: visualObservationSchema,
  }).strict()).max(4),
}).strict().superRefine((value, context) => {
  const keys = new Set(value.pieces.map(piece => piece.key))
  if (keys.size !== value.pieces.length
    || (value.kind === 'single_garment' && value.pieces.length !== 1)
    || (value.kind === 'outfit' && value.pieces.length < 2)
    || (value.kind === 'unknown' && (value.pieces.length || value.relations.length))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_visual_evidence_subjects' })
  }
  for (const relation of value.relations) {
    if (new Set(relation.subjects).size !== relation.subjects.length || relation.subjects.some(key => !keys.has(key))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'unknown_visual_evidence_subject' })
    }
  }
  if (value.view !== 'worn' && (value.pieces.some(piece => piece.wornDrape.status !== 'unknown')
    || value.relations.some(relation => relation.observation.status !== 'unknown'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'wear_relationship_requires_worn_image' })
  }
})
export type GarmentVisualEvidence = z.infer<typeof garmentVisualEvidenceSchema>
export type VisualObservation = z.infer<typeof visualObservationSchema>
