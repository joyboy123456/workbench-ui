/** 知识库33/57/35/71/72的输入角色与展开契约；不执行外部DSL脚本。 */
export const TEXTILE_PRODUCTION_VERSION = '2026-11-11-2'
export const TEXTILE_BATCH_LIMIT = 120
export const BEDDING_CATEGORIES = ['被子', '床单组', '床垫罩', '枕套', '床笠', '胖被组', '多件套组', '普通毯类', '薄垫', '穿戴毯', '被套组', '地毯', '电热毯', '绗缝被', '睡眠枕'] as const
export type TextileProductionKind = 'bedding-style' | 'bedding-scene' | 'color-reference'
export type TextileReferenceRole = 'product' | 'detail' | 'back' | 'model' | 'pet' | 'color'
export type ColorReferenceMode = 'one-to-many' | 'many-to-one' | 'matrix'
export interface TextileProductionSettings {
  textileWorkflow?: TextileProductionKind
  textileInputRoles?: TextileReferenceRole[]
  productionDirections?: string[]
  colorReferenceMode?: ColorReferenceMode
}
export type TextileReferenceGroups = Partial<Record<TextileReferenceRole, string[]>>
export const TEXTILE_ROLE_LABELS: Record<TextileReferenceRole, string> = {
  product: '商品主图', detail: '同商品细节图', back: '同商品背面图', model: '模特参考图', pet: '宠物参考图', color: '色彩参考图',
}
export const TEXTILE_ROLE_PROMPTS: Record<TextileReferenceRole, string> = {
  product: '商品主图，商品款式、结构、数量、图案尺度与面料的唯一整体依据',
  detail: '同商品细节，只补充花型、纹理、接缝；不提供场景，不把局部花型放大到整件',
  back: '同商品背面，仅用于背面结构与纹理，不代替正面主图',
  model: '人物身份与体态参考，不提供商品、床品、场景或服装款式',
  pet: '宠物外观参考，不提供商品、场景与摆放方式',
  color: '仅提供主辅色及颜色搭配，不复制此图的款式、图案、文字、人物、背景或构图',
}

export function readProductionKind(value: unknown, toolId: number): TextileProductionKind | undefined {
  if (value === undefined) return undefined
  const expected = toolId === 80303 ? 'bedding-style' : toolId === 80304 ? 'bedding-scene' : toolId === 80305 ? 'color-reference' : null
  if (value !== expected) throw new Error('此工具不支持所选生产流程')
  return value as TextileProductionKind
}

export function readProductionDirections(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 15
    || value.some(item => typeof item !== 'string' || !item.trim() || [...item.trim()].length > 160)) {
    throw new Error('请填写1～15个场景或风格，每项不超过160字')
  }
  const directions = value.map(item => item.trim())
  if (new Set(directions).size !== directions.length) throw new Error('场景或风格不能重复')
  return directions
}

/** 每行只有一个商品；前端压缩空位后仍须显式保留角色，服务端再次独立校验。 */
export function readProductionRoles(value: unknown, count: number, kind: TextileProductionKind): TextileReferenceRole[] {
  if (!Array.isArray(value) || value.length !== count || value[0] !== 'product') throw new Error('商品主图与参考图角色不匹配')
  const limits: Record<TextileReferenceRole, number> = { product: 1, detail: 4, back: kind === 'bedding-scene' ? 2 : 0, model: 3, pet: 1, color: 0 }
  if (kind === 'color-reference') Object.assign(limits, { detail: 0, back: 0, model: 0, pet: 0, color: 1 })
  const counts = new Map<string, number>()
  const order = ['product', 'detail', 'back', 'model', 'pet', 'color']
  let prior = -1
  for (const role of value) {
    const index = order.indexOf(role)
    const total = (counts.get(role) ?? 0) + 1
    if (index < prior || index < 0 || total > limits[role as TextileReferenceRole]) throw new Error('参考图角色、顺序或数量无效')
    counts.set(role, total); prior = index
  }
  if (kind === 'color-reference' && counts.get('color') !== 1) throw new Error('参考配色需要一张商品图和一张色彩参考图')
  return [...value]
}

export function readColorReferenceMode(value: unknown): ColorReferenceMode {
  if (value === 'one-to-many' || value === 'many-to-one' || value === 'matrix') return value
  throw new Error('请选择有效的参考配色组合方式')
}

export function expandTextileProduction(toolId: number, settings: TextileProductionSettings, groups: TextileReferenceGroups) {
  const kind = readProductionKind(settings.textileWorkflow, toolId)
  if (!kind) throw new Error('请选择生产流程')
  for (const ids of Object.values(groups)) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('同组素材缺失或重复')
  }
  const products = groups.product ?? []
  if (kind === 'color-reference') {
    const colors = groups.color ?? []
    const mode = readColorReferenceMode(settings.colorReferenceMode)
    const maxProducts = mode === 'one-to-many' ? 1 : mode === 'matrix' ? 8 : 30
    const maxColors = mode === 'many-to-one' ? 1 : mode === 'matrix' ? 15 : 30
    if (!products.length || !colors.length || products.length > maxProducts || colors.length > maxColors) throw new Error(`此模式最多${maxProducts}张商品图、${maxColors}张色彩参考图`)
    if (Object.entries(groups).some(([role, ids]) => !['product', 'color'].includes(role) && ids.length)) throw new Error('参考配色仅接受商品图与色彩参考图')
    return products.flatMap((product, p) => colors.map((color, c) => ({
      label: `商品 ${p + 1} × 配色 ${c + 1}`, ids: [product, color],
      roles: ['product', 'color'] as TextileReferenceRole[], direction: undefined,
    })))
  }
  if (products.length !== 1) throw new Error('床品产线需要一张商品主图')
  const roles: TextileReferenceRole[] = [], ids: string[] = []
  for (const role of ['product', 'detail', 'back', 'model', 'pet', 'color'] as const) {
    for (const id of groups[role] ?? []) { roles.push(role); ids.push(id) }
  }
  readProductionRoles(roles, ids.length, kind)
  return readProductionDirections(settings.productionDirections).map(direction => ({ label: direction, ids: [...ids], roles: [...roles], direction }))
}
