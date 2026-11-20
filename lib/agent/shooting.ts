import { z } from 'zod'
import { OUTFIT_ROLES } from './outfit'
import type { TaskStatus } from '../types'
import { accompanimentSchema } from './accompaniment-catalog'
import { lookReferenceSchema } from './outfit-reference'
import { commerceMainImageSnapshotSchema } from './commerce-main-image'

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)
const pose = z.string().trim().min(1).max(600)
export const CURRENT_TURN_CONSTRAINTS_VERSION = 'current-turn-constraints-v1' as const
export const PROJECT_USER_CONSTRAINTS_VERSION = 'project-user-constraints-v2' as const
const constraintQuote = z.string().trim().min(1).max(1000)
/** 只引用本轮原话；输出序号由服务端绑定到实际成片位，模型不能写历史位ID。 */
export const wearingConstraintDeclarationSchema = z.object({
  quote: constraintQuote,
  outputIndexes: z.array(z.number().int().min(1).max(10)).min(1).max(10)
    .refine(items => new Set(items).size === items.length).optional(),
}).strict()
export type WearingConstraintDeclaration = z.infer<typeof wearingConstraintDeclarationSchema>
export const currentTurnConstraintsSchema = z.object({
  version: z.enum([CURRENT_TURN_CONSTRAINTS_VERSION, PROJECT_USER_CONSTRAINTS_VERSION]),
  request: z.object({ messageId: id, text: z.string().min(1).max(8000) }).strict(),
  sourceMessages: z.array(z.object({ messageId: id, text: z.string().min(1).max(8000) }).strict()).max(100).optional(),
  global: z.array(constraintQuote).max(24),
  outputs: z.array(z.object({ outputSlotId: id, constraints: z.array(constraintQuote).min(1).max(24) }).strict()).max(10),
}).strict().superRefine((value, ctx) => {
  if (value.version === CURRENT_TURN_CONSTRAINTS_VERSION && value.sourceMessages !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '旧穿法快照不能包含历史来源' })
  }
  const sources = [value.request, ...(value.version === PROJECT_USER_CONSTRAINTS_VERSION ? value.sourceMessages ?? [] : [])]
  if ([...value.global, ...value.outputs.flatMap(item => item.constraints)].some(quote => !sources.some(source => source.text.includes(quote)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '拍摄约束必须逐字引用本轮原话' })
  }
  if (new Set(value.outputs.map(item => item.outputSlotId)).size !== value.outputs.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '拍摄约束输出位重复' })
  }
})
export type CurrentTurnConstraints = z.infer<typeof currentTurnConstraintsSchema>
export interface CurrentTurnConstraintSource {
  version?: typeof PROJECT_USER_CONSTRAINTS_VERSION
  sourceMessages?: { messageId: string; text: string }[]
  messageId: string
  text: string
  declarations: readonly WearingConstraintDeclaration[]
}

export function freezeCurrentTurnConstraints(source: CurrentTurnConstraintSource, outputSlotIds: readonly string[]): CurrentTurnConstraints {
  const parsed = z.array(wearingConstraintDeclarationSchema).max(24).parse(source.declarations)
  const sources = [source, ...(source.version === PROJECT_USER_CONSTRAINTS_VERSION ? source.sourceMessages ?? [] : [])]
  const declarations = source.version === PROJECT_USER_CONSTRAINTS_VERSION
    ? parsed.filter(item => sources.some(message => message.text.includes(item.quote))) : parsed
  if (declarations.some(item => item.outputIndexes?.some(index => index > outputSlotIds.length))) throw new Error('constraint_output_missing')
  return currentTurnConstraintsSchema.parse({ version: source.version ?? CURRENT_TURN_CONSTRAINTS_VERSION,
    request: { messageId: source.messageId, text: source.text },
    ...(source.version === PROJECT_USER_CONSTRAINTS_VERSION ? { sourceMessages: (source.sourceMessages ?? [])
      .filter(message => declarations.some(item => message.text.includes(item.quote))) } : {}),
    global: [...new Set(declarations.filter(item => !item.outputIndexes).map(item => item.quote))],
    outputs: outputSlotIds.flatMap((outputSlotId, index) => {
      const constraints = [...new Set(declarations.filter(item => item.outputIndexes?.includes(index + 1)).map(item => item.quote))]
      return constraints.length ? [{ outputSlotId, constraints }] : []
    }),
  })
}
export const shootingRequestSchema = z.object({
  board: z.object({ id, revision: z.number().int().positive() }).strict().optional(),
  sourceNodeId: id.optional(),
  modelNodeId: id.optional(),
  styleNodeId: id.optional(),
  modelDescription: z.string().trim().max(1000).optional(),
  scene: z.string().trim().max(2000).optional(),
  resultCount: z.number().int().min(1).max(10),
  poses: z.array(pose).min(1).max(10).optional(),
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.board) === Boolean(value.sourceNodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请选择一套搭配或一张造型参考图' })
  if (value.poses && value.poses.length !== value.resultCount) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '姿势数量必须与图片张数一致' })
})
export type ShootingRequest = z.infer<typeof shootingRequestSchema>

const shootingBoardSchema = z.object({
  primaryDetailAssetIds: z.array(id).max(8).refine(ids => new Set(ids).size === ids.length).optional(),
  lookReference: lookReferenceSchema.optional(),
  id, revision: z.number().int().positive(), title: z.string().max(160), primaryAssetId: id,
  pieces: z.array(z.object({ role: z.enum(OUTFIT_ROLES), assetId: id, reason: z.string().max(2000) }).strict()).min(1).max(8),
  genericAccompaniments: z.array(accompanimentSchema).min(1).max(2).optional(),
}).strict()
type ShootingBoard = z.infer<typeof shootingBoardSchema>
type ShootingReference = { assetId: string; role: 'garment' | 'model' | 'look' | 'style' | 'outfit_reference' | 'pose' | 'primary_detail'; outfitRole?: typeof OUTFIT_ROLES[number] }

function boardMatchesReferences(board: ShootingBoard, refs: readonly ShootingReference[]): boolean {
  const primary = board.pieces.filter(piece => piece.role === 'primary')
  return primary.length === 1 && primary[0].assetId === board.primaryAssetId
    && (board.pieces.length >= 2 || Boolean(board.genericAccompaniments?.length) || Boolean(board.lookReference))
    && (!board.lookReference || refs.some(ref => ref.role === 'outfit_reference' && ref.assetId === board.lookReference!.source.assetId))
    && new Set([...board.pieces.map(piece => piece.role), ...(board.genericAccompaniments ?? []).map(piece => piece.role)]).size === board.pieces.length + (board.genericAccompaniments?.length ?? 0)
    && new Set(board.pieces.map(piece => piece.assetId)).size === board.pieces.length
    && board.pieces.every(piece => refs.some(ref => ref.role === 'garment' && ref.outfitRole === piece.role && ref.assetId === piece.assetId))
}

/**
 * v1 快照：board 可选（单套）；boards 可选（多套，与 board 互斥），此时每个 shot 必须带 boardId。
 * 旧快照不含 boards/boardId，解析结果与摘要保持不变。
 */
export const shootingSnapshotSchema = z.object({
  schemaVersion: z.literal(1), id,
  commerceMainImage: commerceMainImageSnapshotSchema.optional(),
  /** 新单套原图拍摄：规划附图与供应商同序，来源段只陈述角色，不追加历史穿法。 */
  sourcePolicy: z.literal('original-garments-v2').optional(),
  /** 独立的新版本能力，不扩张 original-garments-v2 的单套语义。缺省旧快照逐字保持。 */
  currentTurnConstraints: currentTurnConstraintsSchema.optional(),
  board: shootingBoardSchema.optional(),
  boards: z.array(shootingBoardSchema).min(1).max(10).optional(),
  references: z.array(z.object({ assetId: id, role: z.enum(['garment', 'model', 'look', 'style', 'outfit_reference', 'pose', 'primary_detail']), outfitRole: z.enum(OUTFIT_ROLES).optional() }).strict()).min(1).max(10),
  modelDescription: z.string().trim().max(1000),
  scene: z.string().trim().max(2000),
  shots: z.array(z.object({ outputSlotId: id, pose, boardId: id.optional() }).strict()).min(1).max(10),
  poseSource: z.enum(['user', 'auto']),
  parent: z.object({ assetId: id, taskId: id.optional(), snapshotId: id.optional() }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  const refs = value.references
  if (value.commerceMainImage) {
    const outputs = value.commerceMainImage.outputs
    if (outputs.length !== value.shots.length || new Set(outputs.map(o => o.outputSlotId)).size !== outputs.length
      || outputs.some(output => {
        const shot = value.shots.find(item => item.outputSlotId === output.outputSlotId)
        const board = value.boards ? value.boards.find(item => item.id === shot?.boardId) : value.board
        // 按输出位对应的搭配核对，不能以另一套拥有该参考代替本张实际来源。
        return !shot || !board || !refs.some(reference => reference.assetId === output.design.referenceAssetId
          && (reference.role === 'style' || reference.role === 'outfit_reference'
            && board.lookReference?.source.assetId === reference.assetId))
      })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'main_image_output_or_reference_mismatch' })
    }
  }
  const allBoards = value.boards ?? (value.board ? [value.board] : [])
  if (allBoards.some(board => board.primaryDetailAssetIds?.some(id => !refs.some(ref => ref.role === 'primary_detail' && ref.assetId === id)))
    || refs.some(ref => ref.role === 'primary_detail' && !allBoards.some(board => board.primaryDetailAssetIds?.includes(ref.assetId)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '主推细节图缺少本套绑定' })
  }
  if (refs.some(ref => ref.role === 'outfit_reference' && !allBoards.some(board => board.lookReference?.source.assetId === ref.assetId))
    || allBoards.some(board => board.lookReference && (!refs.some(ref => ref.role === 'outfit_reference' && ref.assetId === board.lookReference!.source.assetId)
      || board.pieces.some(piece => board.lookReference!.roles.includes(piece.role))))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '竞品参考必须绑定本套实际采用的来源与部位' })
  }
  if (value.currentTurnConstraints?.outputs.some(item => !value.shots.some(shot => shot.outputSlotId === item.outputSlotId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '拍摄约束引用不存在的输出位' })
  }
  if (value.sourcePolicy && (!value.board || value.boards || value.parent || refs.some(ref => ref.role === 'look'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '原图来源策略仅用于单套原始服装拍摄' })
  }
  if (new Set(refs.map(ref => ref.assetId)).size !== refs.length || new Set(value.shots.map(shot => shot.outputSlotId)).size !== value.shots.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '拍摄来源或输出位重复' })
  if (refs.filter(ref => ref.role === 'model').length > 1 || refs.filter(ref => ref.role === 'look').length > 1
    || refs.filter(ref => ref.role === 'style').length > 1 || refs.filter(ref => ref.role === 'pose').length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '模特、造型或风格参考只能各有一张' })
  if (value.parent && !refs.some(ref => ref.assetId === value.parent!.assetId && ref.role === 'look')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '延续来源缺少造型参考' })
  if (value.board) {
    const primary = value.board.pieces.filter(piece => piece.role === 'primary')
    if (primary.length !== 1 || primary[0].assetId !== value.board.primaryAssetId
      || value.board.pieces.some(piece => !refs.some(ref => ref.role === 'garment' && ref.outfitRole === piece.role && ref.assetId === piece.assetId))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '搭配版本与实际服装参考不一致' })
    }
  }
  if (value.board && value.boards) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '单套与多套搭配不能同时存在' })
  if (!value.boards) {
    if (value.shots.some(shot => shot.boardId !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '输出位引用了不存在的搭配' })
    return
  }
  const boards = value.boards
  const boardIds = new Set(boards.map(board => board.id))
  if (boardIds.size !== boards.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '搭配重复' })
  if (boards.some(board => !boardMatchesReferences(board, refs))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '搭配版本与实际服装参考不一致' })
  // 每张服装参考都属于某一套；造型延续来源自带整套服装，不能与多套搭配混用。
  if (refs.some(ref => ref.role === 'garment' && !boards.some(board => board.pieces.some(piece => piece.assetId === ref.assetId)))
    || refs.some(ref => ref.role === 'look') || value.parent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '多套搭配的参考图只能是各套单品、模特与风格参考' })
  }
  if (value.shots.some(shot => shot.boardId === undefined || !boardIds.has(shot.boardId))
    || boards.some(board => !value.shots.some(shot => shot.boardId === board.id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '每个输出位必须指向一套已冻结搭配，且每套至少出一张' })
  }
})
export type ShootingSnapshot = z.infer<typeof shootingSnapshotSchema>

/**
 * 多套搭配快照的逐图参考图下标（指向 references，即有序 inputAssetIds）：
 * 本套单品 + 模特 + 风格参考，按 references 顺序升序。单套或旧快照返回 undefined（每张用全部参考图）。
 * 调用方须传入已通过 shootingSnapshotSchema 的快照。
 */
export function shootingOutputReferenceIndexes(snapshot: ShootingSnapshot): number[][] | undefined {
  const boards = snapshot.boards
  if (!boards) return undefined
  return snapshot.shots.map(shot => {
    const board = boards.find(item => item.id === shot.boardId)
    if (!board) throw new Error(`输出位 ${shot.outputSlotId} 未绑定已冻结搭配`)
    return snapshot.references.flatMap((reference, index) => (reference.role === 'garment'
      ? board.pieces.some(piece => piece.assetId === reference.assetId)
      : reference.role === 'primary_detail' ? board.primaryDetailAssetIds?.includes(reference.assetId)
        : reference.role === 'outfit_reference' ? board.lookReference?.source.assetId === reference.assetId
        : reference.role === 'model' || reference.role === 'style' || reference.role === 'pose') ? [index] : [])
  })
}

export interface ShootingOutputBinding {
  snapshotId: string
  snapshotDigest: string
  outputSlotId: string
  pose: string
}

/** 只含当前会话可见来源节点，不暴露历史供应商 URL 或内部执行凭证。 */
export interface StudioShootingView {
  id: string
  taskId: string
  title: string
  board?: { id: string; revision: number; title: string }
  references: Array<{ nodeId?: string; name: string; role: ShootingSnapshot['references'][number]['role']; outfitRole?: ShootingSnapshot['references'][number]['outfitRole']; available: boolean }>
  modelDescription: string
  scene: string
  shots: Array<{ outputSlotId: string; pose: string; nodeIds: string[]; board?: { id: string; revision: number; title: string }; referenceIndexes?: number[]; boardTitle?: string; failed?: boolean; retryReferenceNodeId?: string }>
  parentNodeId?: string
  createdAt?: string
  taskStatus?: TaskStatus
}

export function defaultShootingPoses(count: number): string[] {
  const poses = ['正面全身自然站姿，清楚展示整套服装和比例', '四分之三侧身，展现服装轮廓与层次', '侧面自然行走，展示面料垂坠与动态', '背面自然站姿，清楚展示后背设计', '轻微转身回眸，保持衣服完整可见', '坐姿展示，避免遮挡主推商品细节', '近景展示领口、面料或配饰细节', '抬手整理衣袖，动作自然且服装不变', '正面放松站姿，变换手部动作与视线', '低幅度迈步，完整呈现鞋履与下装']
  return poses.slice(0, Math.max(1, Math.min(10, count)))
}
