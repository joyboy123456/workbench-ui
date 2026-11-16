import { filterGenerations, generationDetail } from './generation-history'
import { downloadGenerationArchive } from './generation-download'
/**
 * V2 的本地 mock 数据源。接线时换成调用后端的实现，保持 V2DataSource 接口不变即可。
 * 所有名称、张数、积分都是占位。
 */
import { createStressCanvas } from './mock-canvas'
import { composerOptions } from './composer-options'
import type {
  Account, ActiveTask, AgentMode, AskMessage, AssistantMessage, BrandKit, CanvasItem, CaseExample, ChatAttachment, ChatMessage,
  FashionModel, Generation, ImageRef, Material, Product, ProductCategory, Project, ToolCatalogItem, ToolCategoryId, ToolCover, ToolDef, ToolField, ToolParams,
} from './types'
import type { AgentEvent, ProductQuery, GenerationQuery, V2DataSource } from './data-source'
import { placeResults } from './arrange'
import { referenceParents } from './provenance'
import { canvasItemsSchema, chatMessagesSchema } from './project-schema'
import { z } from 'zod'
import { generationTarget, mergeGenerationItem } from './generation-progress'
import type { V2SessionSource, V2SessionUser } from './session'

/** 纯前端仓库不接账号：始终以演示用户身份进入。 */
const DEMO_USER: V2SessionUser = { id: 'demo', username: 'demo', displayName: '演示用户' }
function mockSession(): V2SessionSource {
  return {
    async getSession() { return DEMO_USER },
    async login() { return DEMO_USER },
    async register() { return DEMO_USER },
  }
}

const M = '/v2-mock/'
let seq = 0
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`
const img = (file: string, width: number, height: number): ImageRef => ({ id: file, url: M + file, width, height })
const nowIso = () => new Date().toISOString()
const daysAgo = (d: number, h = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, 0, 0, 0); return t.toISOString() }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 静态数据 ---------------- */

const categories: ProductCategory[] = [
  { id: 'apparel', name: '服装', count: 0 },
  { id: 'bags', name: '鞋包', count: 0 },
  { id: 'accessory', name: '配饰', count: 0 },
  { id: 'beauty', name: '美妆', count: 0 },
  { id: 'appliance', name: '家电', count: 0 },
  { id: 'digital', name: '3C', count: 0 },
]

const P = (id: string, name: string, categoryId: string, images: ImageRef[], generatedCount: number, projectIds: string[]): Product =>
  ({ id, name, categoryId, images, generatedCount, projectIds, createdAt: daysAgo(6), updatedAt: daysAgo(1) })

const products: Product[] = [
  P('p_lace', '蕾丝荷叶领连衣裙', 'apparel', [img('k-701-look01.jpg', 1100, 1473)], 24, ['pj_west']),
  P('p_tweed', '米白粗花呢套装', 'apparel', [img('c10r1.jpg', 320, 823)], 12, ['pj_tweed']),
  P('p_ruffle', '黑色荷叶边外套', 'apparel', [img('c5r1.jpg', 320, 795)], 8, []),
  P('p_chain', '菱格链条包', 'bags', [img('c10r2.jpg', 320, 314)], 8, ['pj_tweed']),
  P('p_heel', '尖头细跟鞋', 'bags', [img('c6r1.jpg', 320, 319)], 16, []),
  P('p_hoop', '金色耳圈', 'accessory', [img('c2r1.jpg', 320, 166)], 6, []),
  P('p_tote', '草编托特包', 'bags', [img('c3r1.jpg', 320, 309)], 9, []),
  P('p_bucket', '草编水桶包', 'bags', [img('c8r2.jpg', 320, 291)], 4, []),
  P('p_drop', '钻石花耳坠', 'accessory', [img('c4r2.jpg', 320, 311)], 11, []),
  P('p_shades', '猫眼墨镜', 'accessory', [img('c2r3.jpg', 320, 164)], 5, []),
  P('p_shoulder', '皮质腋下包', 'bags', [img('c12r2.jpg', 320, 356)], 0, []),
  P('p_cuff', '菱纹耳扣', 'accessory', [img('c6r2.jpg', 320, 247)], 0, []),
  P('p_fryer', '空气炸锅（占位）', 'appliance', [], 0, []),
  P('p_buds', '蓝牙耳机（占位）', 'digital', [], 0, []),
  P('p_serum', '精华液（占位）', 'beauty', [], 0, []),
]

const models: FashionModel[] = [
  { id: 'm_linxi', name: '林夕（占位）', cover: img('k-look05-face.jpg', 900, 1000), tags: ['女', '欧美', '25-30'], source: 'custom' },
  { id: 'm_a', name: '模特 A（占位）', cover: img('c7.jpg', 640, 857), tags: ['女', '亚洲'], source: 'preset' },
  { id: 'm_b', name: '模特 B（占位）', cover: img('c3.jpg', 640, 857), tags: ['女', '亚洲'], source: 'preset' },
  { id: 'm_c', name: '模特 C（占位）', cover: img('c9.jpg', 640, 857), tags: ['女', '欧美'], source: 'preset' },
  { id: 'm_d', name: '模特 D（占位）', cover: img('c11.jpg', 640, 857), tags: ['女', '欧美'], source: 'preset' },
  { id: 'm_e', name: '模特 E（占位）', cover: img('c12.jpg', 640, 857), tags: ['女', '亚洲'], source: 'preset' },
]

const brandKits: BrandKit[] = [
  { id: 'b_main', name: '店铺品牌（占位）', colors: ['#2B211B', '#C9A27A', '#F3EDE4', '#8A4B2F'], fonts: ['思源宋体', '思源黑体'], references: [img('k-80232-s1.jpg', 1100, 1469), img('k-banner01.jpg', 1100, 516)], guidance: '暖调、自然光，留白多，标题用宋体。' },
]

const materials: Material[] = [
  { id: 'mt_1', name: '草原外景参考', image: img('k-banner01.jpg', 1100, 516), origin: 'saved', createdAt: daysAgo(1) },
  { id: 'mt_2', name: '室内书房参考', image: img('c1.jpg', 640, 857), origin: 'upload', createdAt: daysAgo(3) },
  { id: 'mt_3', name: '湖边餐桌参考', image: img('c2.jpg', 640, 857), origin: 'upload', createdAt: daysAgo(3) },
  { id: 'mt_4', name: '街拍参考', image: img('c4.jpg', 640, 954), origin: 'clip', createdAt: daysAgo(5) },
]

const G = (id: string, projectId: string, f: ImageRef, kind: Generation['kind'], d: number, extra: Partial<Generation> = {}): Generation =>
  ({ id, projectId, image: f, kind, productIds: ['p_lace'], modelId: 'm_linxi', createdAt: daysAgo(d, 14), status: 'done', prompt: '保留商品版型、蕾丝领口和腰带细节，自然光下的电商展示图。', toolId: 'swap-bg', runId: `demo-${projectId}-${kind}-${d}`, modelName: '演示模型', ratio: kind === 'banner' ? '16:9' : '3:4', resolution: '2K', outputCount: kind === 'detail' ? 3 : 4, params: { prompt: '保留商品版型、蕾丝领口和腰带细节，自然光下的电商展示图。', scene: 'nature', n: '4' }, ...extra })

const generations: Generation[] = [
  G('g_m1', 'pj_west', img('k-701-look01.jpg', 1100, 1473), 'main', 0),
  G('g_m2', 'pj_west', img('k-701-look02.jpg', 1100, 1473), 'main', 0),
  G('g_m3', 'pj_west', img('k-701-look05b.jpg', 1100, 1473), 'main', 0),
  G('g_m4', 'pj_west', img('k-701-look08.jpg', 1100, 1473), 'main', 0),
  ...[1, 2, 3, 4].map((i) => G(`g_p${i}`, 'pj_west', img(`k-705-look12-shot_${i}.jpg`, 1100, 1473), 'model', 1, { toolId: 'multi-angle', parentId: 'ci_g_m1', params: { angles: ['front-full', 'side-45', 'back-full', 'detail-upper'] } })),
  G('g_d1', 'pj_west', img('k-80232-s1.jpg', 1100, 1469), 'detail', 0, { parentId: 'ci_g_m1', toolId: 'detail-page', params: { screens: '3', prompt: '保留商品细节，以自然光展示。' } }),
  G('g_d2', 'pj_west', img('k-80232-s2.jpg', 1100, 1469), 'detail', 0, { parentId: 'ci_g_m1', toolId: 'detail-page', params: { screens: '3', prompt: '保留商品细节，以自然光展示。' } }),
  G('g_d3', 'pj_west', img('k-80232-s3.jpg', 1100, 1469), 'detail', 0, { parentId: 'ci_g_m1', toolId: 'detail-page', params: { screens: '3', prompt: '保留商品细节，以自然光展示。' } }),
  G('g_bn', 'pj_west', img('k-banner01.jpg', 1100, 516), 'banner', 1),
  ...[1, 2, 3, 4, 5, 6].map((i) => G(`g_t${i}`, 'pj_tweed', img(`c${[1, 2, 6, 8, 10, 12][i - 1]}.jpg`, 640, 857), 'main', 3, { productIds: ['p_tweed', 'p_chain'], modelId: 'm_a' })),
]

const projects: Project[] = [
  { id: 'pj_west', name: '秋日西部 · 蕾丝连衣裙', cover: img('k-701-look01.jpg', 1100, 1473), productIds: ['p_lace'], updatedAt: daysAgo(0, 15) },
  { id: 'pj_tweed', name: '粗花呢套装 · 上新', cover: img('c10.jpg', 640, 857), productIds: ['p_tweed', 'p_chain'], updatedAt: daysAgo(3) },
  { id: 'pj_new', name: '未命名项目', productIds: [], updatedAt: daysAgo(5) },
]

/** 图片按原像素 × 统一缩放落位（与 R4.5 原型一致） */
export const CANVAS_SCALE = 150 / 1100
const GAP = 14
function layoutRows(rows: Generation[][]): CanvasItem[] {
  const out: CanvasItem[] = []
  let y = 0
  for (const row of rows) {
    let x = 0, mh = 0
    for (const g of row) {
      // mock 图是压缩过的小图；按原图像素换算（主图 1100 宽、banner 原图 2048 宽）
      const nativeW = g.kind === 'banner' ? 2048 : 1100
      const w = Math.round(nativeW * CANVAS_SCALE)
      const h = Math.round((w * g.image.height) / g.image.width)
      out.push({ id: 'ci_' + g.id, ref: { type: 'generation', id: g.id }, image: g.image, x, y, w, status: g.status, createdAt: g.createdAt, ...(g.parentId ? { parentId: 'ci_' + g.parentId, parentIds: ['ci_' + g.parentId] } : {}) })
      x += w + GAP; mh = Math.max(mh, h)
    }
    y += mh + GAP
  }
  return out
}

const canvasByProject: Record<string, CanvasItem[]> = {
  pj_west: (() => {
    const g = (id: string) => generations.find((x) => x.id === id)!
    const items = layoutRows([
      ['g_m1', 'g_m2', 'g_m3', 'g_m4'].map(g),
      ['g_p1', 'g_p2', 'g_p3', 'g_p4'].map(g),
      ['g_d1', 'g_d2', 'g_d3'].map(g),
      ['g_bn'].map(g),
    ])
    return items
  })(),
  pj_tweed: layoutRows([generations.filter((g) => g.projectId === 'pj_tweed')]),
  pj_new: [],
}

const att = (kind: ChatAttachment['kind'], id: string, label: string, image: ImageRef): ChatAttachment => ({ kind, id, label, image })

const messagesByProject: Record<string, ChatMessage[]> = {
  pj_west: [
    { id: 'u1', role: 'user', createdAt: daysAgo(0, 14), text: '这套出 4 张草原主图，模特用林夕，蕾丝领口和流苏腰带要保留。',
      attachments: [att('product', 'p_lace', '蕾丝荷叶领连衣裙', products[0].images[0]), att('model', 'm_linxi', '林夕', models[0].cover)] },
    { id: 'a1', role: 'assistant', createdAt: daysAgo(0, 14),
      steps: [
        { label: '画布读取完成', icon: 'doc', status: 'done' },
        {
          label: '思考完成',
          icon: 'think',
          status: 'done',
          collapsible: true,
          detail: '1. 提取商品「蕾丝荷叶领连衣裙」的领口与流苏腰带结构约束；\n2. 绑定模特林夕面部与身形特征；\n3. 设定黄昏侧逆光草原外景，分别规划倚栏、走动、蒙古包前、车旁 4 个机位。',
        },
        { label: '使用 Nano Banana 2 生成图片', icon: 'image', status: 'done' },
      ],
      results: ['g_m1', 'g_m2', 'g_m3', 'g_m4'].map((id) => ({ id, image: generations.find((g) => g.id === id)!.image, status: 'done' as const })),
      meta: {
        spec: '3:4 · 1536×2048 · Nano Banana 2',
        highlights: [
          '版型、蕾丝荷叶领和流苏腰带全部锁定，只换场景和姿势',
          '黄昏侧逆光，草色压暖，让米白蕾丝不发灰',
          '4 张分别是倚栏、走动、蒙古包前、车旁，方便挑主图',
        ],
        suggestions: ['加两张领口近景特写', '把车旁那张改成竖版全身', '背景草色再压暖一点', '换阴天柔光棚拍'],
      },
      body: '已为你生成 4 张草原外景主图，整体保留了蕾丝荷叶领和流苏腰带的细节结构。你可以点击缩略图在画布中查看原图，或直接点击下方调整方向继续微调。' },
    { id: 'u2', role: 'user', createdAt: daysAgo(0, 15), text: '挑 @主图 1 这张，做一套 6 屏详情页。',
      attachments: [att('canvas', 'ci_g_m1', '主图 1', generations[0].image)] },
    { id: 'a2', role: 'assistant', createdAt: daysAgo(0, 15),
      steps: [
        { label: '画布读取完成', icon: 'doc', status: 'done' },
        {
          label: '思考完成',
          icon: 'think',
          status: 'done',
          collapsible: true,
          detail: '读取主图 1 的色调与构图，匹配品牌规范中的米白底色与宋体标题体系，拆分为首屏卖点、细节、场景前三屏。',
        },
        { label: '使用 Nano Banana 2 生成图片', icon: 'doc', status: 'done' },
      ],
      results: ['g_d1', 'g_d2', 'g_d3'].map((id) => ({ id, image: generations.find((g) => g.id === id)!.image, status: 'done' as const })),
      meta: {
        spec: '3:4 · 1536×2048 · Nano Banana 2',
        highlights: [
          '版式沿用店铺品牌的米白底和宋体标题',
          '卖点文案取自商品的卖点字段',
        ],
        suggestions: ['继续生成后 3 屏（尺码、面料、售后）', '标题字号放大 15%', '换成深色杂志风版式'],
      },
      body: '详情页前 3 屏好了：首屏卖点、细节、场景。后 3 屏（尺码、面料、售后）要不要接着出？' },
  ],
  pj_tweed: [
    {
      id: 'u_tweed_1',
      role: 'user',
      createdAt: daysAgo(3, 10),
      text: '帮这套粗花呢套装出主图',
      attachments: [att('product', 'p_tweed', '米白粗花呢套装', products[1].images[0])],
    },
    {
      id: 'ask_tweed_1',
      role: 'ask',
      createdAt: daysAgo(3, 10),
      reason: '你还没有指定拍摄场景和光线氛围，不同风格会影响模特穿搭和背景质感：',
      question: '这组粗花呢套装主图希望用哪种场景风格？',
      options: [
        { key: 'A', label: '法式街拍外景', description: '咖啡馆外摆、石板路自然光，突出优雅通勤感' },
        { key: 'B', label: '极简影棚纯色底', description: '高级灰或米白背景，聚光突出粗花呢肌理细节' },
        { key: 'C', label: '室内复古书房', description: '木质书架与暖色台灯，营造秋日松弛氛围' },
      ],
      otherPlaceholder: '描述你想要的其他场景、光线或模特要求…',
    },
  ],
  pj_new: [],
}

const N_SEG: ToolField = { id: 'n', label: '张数', kind: 'segment', options: [{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '4', label: '4' }], default: '1', count: true }
const RATIOS = [{ id: '1:1', label: '1:1' }, { id: '3:4', label: '3:4' }, { id: '4:3', label: '4:3' }, { id: '9:16', label: '9:16' }, { id: '16:9', label: '16:9' }]

export const TOOLS: ToolDef[] = [
  /* 选中单图 · 顶部工具条（高频，平铺） */
  { id: 'outpaint', name: 'AI扩图', surfaces: ['selection', 'home', 'slash'], icon: 'fit', overlay: 'frame-out', cost: 4,
    tip: '虚线框是扩完的画面，商品和模特保持不变。',
    fields: [
      { id: 'ratio', label: '目标比例', kind: 'segment', options: RATIOS, default: '1:1', ratio: true },
      { id: 'prompt', label: '扩出来的部分', kind: 'text', optional: true, placeholder: '不填就按原图场景自然延伸' },
      N_SEG,
    ] },
  { id: 'upscale', name: '高清放大', surfaces: ['selection', 'batch', 'home', 'slash'], icon: 'up', backendToolId: 80242, cost: 2,
    options: [{ id: '2x', label: '2 倍', hint: '约 2K' }, { id: '4x', label: '4 倍', hint: '约 4K' }] },
  { id: 'inpaint', name: '局部修改', surfaces: ['selection', 'slash'], icon: 'wand', backendToolId: 80240, overlay: 'mask', cost: 4,
    tip: '在图上涂出要改的地方，涂抹区域外保持不变。',
    fields: [
      { id: 'brush', label: '画笔', kind: 'slider', min: 6, max: 60, default: 24 },
      { id: 'prompt', label: '改成什么', kind: 'text', placeholder: '如：把腰带换成黑色细皮带' },
      { id: 'ref', label: '参考图', kind: 'ref', optional: true },
      { id: 'n', label: '张数', kind: 'segment', options: [{ id: '1', label: '1' }, { id: '2', label: '2' }], default: '2', count: true },
    ] },
  { id: 'erase', name: '智能消除', surfaces: ['selection', 'slash'], icon: 'erase', backendToolId: 80243, overlay: 'mask', cost: 2,
    tip: '涂掉要去除的东西（水印、杂物、路人），背景自动补齐。',
    fields: [{ id: 'brush', label: '画笔', kind: 'slider', min: 6, max: 60, default: 28 }] },
  { id: 'cutout', name: '一键抠图', surfaces: ['selection', 'batch', 'home', 'slash'], icon: 'cut', backendToolId: 80244, cost: 1 },
  { id: 'pose', name: '换姿势', surfaces: ['selection', 'slash'], icon: 'pose', backendToolId: 706, cost: 4,
    tip: '人物、服装和背景不变，只换姿势。每选一个姿势出一张。',
    fields: [
      { id: 'poses', label: '姿势', kind: 'chips', multi: true, count: true, default: ['walk', 'side'],
        options: [{ id: 'stand', label: '正面站立' }, { id: 'walk', label: '走动' }, { id: 'side', label: '侧身' }, { id: 'back', label: '回头' },
          { id: 'sit', label: '坐姿' }, { id: 'lean', label: '倚靠' }, { id: 'hip', label: '叉腰' }, { id: 'pocket', label: '手插兜' }] },
      { id: 'prompt', label: '补充', kind: 'text', optional: true, placeholder: '如：手里拿着包' },
    ] },
  { id: 'swap-bg', name: '换背景', surfaces: ['selection', 'batch', 'slash'], icon: 'cover', backendToolId: 702, cost: 4,
    tip: '商品和模特不变，只换场景，光线会跟着新场景调整。',
    fields: [
      { id: 'scene', label: '场景', kind: 'chips', default: 'studio',
        options: [{ id: 'studio', label: '影棚纯色' }, { id: 'street', label: '街拍' }, { id: 'home', label: '室内家居' }, { id: 'nature', label: '自然风光' }, { id: 'mall', label: '商场橱窗' }] },
      { id: 'prompt', label: '描述', kind: 'text', optional: true, placeholder: '如：浅灰无缝背景，柔光' },
      { id: 'ref', label: '场景参考图', kind: 'ref', optional: true },
      N_SEG,
    ] },
  /* 选中单图 · 「更多」（低频） */
  { id: 'describe', name: '反推提示词', surfaces: ['selection', 'slash'], icon: 'quote', more: true, backendToolId: 80263, cost: 1 },
  { id: 'multi-angle', name: '多机位裂变', surfaces: ['selection', 'slash'], icon: 'grid', more: true, backendToolId: 705, cost: 4,
    tip: '保留商品和人物，换拍摄机位。每选一个机位出一张。',
    fields: [
      { id: 'angles', label: '机位', kind: 'select', multi: true, count: true, default: ['front-full', 'side-45', 'back-full', 'detail-upper'],
        options: [
          { id: 'front-full', label: '正面全身' }, { id: 'front-half', label: '正面半身' }, { id: 'side-45', label: '45° 侧身' }, { id: 'side-90', label: '90° 侧面' },
          { id: 'back-full', label: '背面全身' }, { id: 'back-half', label: '背面半身' }, { id: 'low', label: '低机位仰拍' }, { id: 'high', label: '高机位俯拍' },
          { id: 'detail-upper', label: '上身特写' }, { id: 'detail-lower', label: '下身特写' }, { id: 'detail-collar', label: '领口特写' }, { id: 'detail-cuff', label: '袖口特写' },
          { id: 'detail-fabric', label: '面料微距' }, { id: 'walk', label: '走动抓拍' }, { id: 'sit', label: '坐姿' }, { id: 'wide', label: '远景环境' },
        ] },
    ] },
  { id: 'try-on-swap', name: '模特换衣', surfaces: ['selection', 'slash'], icon: 'model', more: true, backendToolId: 80262, cost: 4,
    tip: '选中的图当人物底图，换上另一件衣服。',
    fields: [
      { id: 'garment', label: '服装', kind: 'ref' },
      { id: 'detail', label: '细节图', kind: 'ref', optional: true },
      N_SEG,
    ] },
  { id: 'fabric', name: '面料换色', surfaces: ['selection', 'slash'], icon: 'layer', more: true, backendToolId: 80212, cost: 4,
    fields: [
      { id: 'mode', label: '方式', kind: 'segment', options: [{ id: 'color', label: '换颜色' }, { id: 'pattern', label: '换花型' }], default: 'color' },
      { id: 'color', label: '颜色', kind: 'chips', default: 'black',
        options: [{ id: 'black', label: '黑' }, { id: 'navy', label: '藏青' }, { id: 'camel', label: '驼色' }, { id: 'wine', label: '酒红' }, { id: 'sage', label: '灰绿' }] },
      { id: 'ref', label: '花型参考图', kind: 'ref', optional: true },
      N_SEG,
    ] },
  { id: 'color-match', name: '参考图校色', surfaces: ['selection', 'slash'], icon: 'tune', more: true, backendToolId: 80239, cost: 2,
    fields: [
      { id: 'ref', label: '目标色参考图', kind: 'ref' },
      { id: 'strength', label: '强度', kind: 'segment', options: [{ id: 'low', label: '轻' }, { id: 'mid', label: '标准' }, { id: 'high', label: '强' }], default: 'mid' },
    ] },
  { id: 'text-edit', name: '文字编辑', surfaces: ['selection'], icon: 'type', more: true, editor: true },
  { id: 'layer-split', name: '图层拆分', surfaces: ['selection', 'slash'], icon: 'layer', more: true, cost: 3 },
  { id: 'move-obj', name: '物体移动', surfaces: ['selection'], icon: 'move', more: true, editor: true },
  /* 选中单图 · 右侧竖条（前端编辑与流转） */
  { id: 'crop', name: '裁剪', surfaces: [], icon: 'crop', editor: true, overlay: 'frame-in',
    tip: '裁剪另存为新图，原图保留。',
    fields: [{ id: 'ratio', label: '比例', kind: 'segment', options: RATIOS, default: '3:4', ratio: true }] },
  { id: 'adjust', name: '调色', surfaces: [], icon: 'tune', editor: true, overlay: 'filter',
    tip: '实时预览，保存为新图，原图保留。',
    fields: [
      { id: 'bright', label: '亮度', kind: 'slider', min: -50, max: 50, default: 0 },
      { id: 'contrast', label: '对比度', kind: 'slider', min: -50, max: 50, default: 0 },
      { id: 'sat', label: '饱和度', kind: 'slider', min: -50, max: 50, default: 0 },
      { id: 'temp', label: '色温', kind: 'slider', min: -50, max: 50, default: 0 },
    ] },
  { id: 'video', name: '生成视频', surfaces: [], icon: 'video', cost: 20,
    tip: '用这张图当首帧生成短视频。',
    fields: [
      { id: 'dur', label: '时长', kind: 'segment', options: [{ id: '5', label: '5 秒' }, { id: '10', label: '10 秒' }], default: '5' },
      { id: 'cam', label: '运镜', kind: 'select', default: 'push',
        options: [{ id: 'fixed', label: '固定机位' }, { id: 'push', label: '缓慢推近' }, { id: 'pull', label: '缓慢拉远' }, { id: 'orbit', label: '环绕' },
          { id: 'pan-l', label: '左摇' }, { id: 'pan-r', label: '右摇' }, { id: 'follow', label: '跟随' }] },
      { id: 'prompt', label: '动作', kind: 'text', optional: true, placeholder: '如：模特转身，裙摆飘起' },
    ] },
  /* 主操作 */
  { id: 'detail-page', name: '做详情页', surfaces: ['selection', 'home', 'slash'], icon: 'doc', primary: true, backendToolId: 80232, cost: 6,
    tip: '用选中的图当主商品图，按屏出图，可单屏重做。',
    fields: [
      { id: 'screens', label: '屏数', kind: 'select', default: '6', count: true,
        options: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: `${i + 1} 屏` })) },
      { id: 'style', label: '风格', kind: 'segment', options: [{ id: 'brand', label: '品牌风格' }, { id: 'clean', label: '简约白底' }, { id: 'mag', label: '杂志感' }], default: 'brand' },
      { id: 'detail', label: '细节图', kind: 'ref', optional: true },
      { id: 'model', label: '指定模特', kind: 'ref', optional: true },
    ] },
  /* 多选 / 首页 / 斜杠 */
  { id: 'fuse', name: '多图融合', surfaces: ['batch', 'slash'], icon: 'layer' },
  { id: 'try-on', name: '模特试穿', surfaces: ['home', 'slash'], icon: 'model', backendToolId: 701 },
  { id: 'white-bg', name: '白底图', surfaces: ['home', 'slash'], icon: 'cover', backendToolId: 707 },
]

/** Agent 首轮回复时按规则生成简短项目标题（纯前端 mock 模拟） */
export function summarizeProjectTitle(text: string, attachments: ChatAttachment[], mode: AgentMode): string {
  const cleanLabel = (label: string) => label.replace(/[（(]占位[)）]/g, '').trim()
  const productAtt = attachments.find(a => a.kind === 'product')
  const primaryAtt = productAtt ?? attachments[0]
  const subject = primaryAtt ? cleanLabel(primaryAtt.label) : ''

  const cleanedText = text
    .replace(/^Q：[^A]*A：/, '')
    .replace(/^\/[^\s]+\s*/, '')
    .replace(/[，。！？、；：.!?;:]+/g, ' ')
    .trim()

  const tagMatches = cleanedText.match(/(草原|海边|街拍|棚拍|影棚|书房|法式|复古|极简|白底|秋日|夏日|冬日|春日|外景|室内|度假|通勤|详情页|套图|主图|海报|试穿|换背景|扩图|特写|胶片)/g) ?? []
  const tags = [...new Set(tagMatches)].slice(0, 2)
  const fallbackTag = mode === 'ecom-set' ? '电商套图' : tags.length ? tags.join('') : '视觉出图'

  if (subject) {
    const shortSub = subject.slice(0, 10)
    const suffix = tags.length ? tags.join('') : (mode === 'ecom-set' ? '详情套图' : '主图')
    const combined = `${shortSub} · ${suffix}`
    return combined.length <= 18 ? combined : `${shortSub.slice(0, 8)} · ${suffix.slice(0, 6)}`
  }

  // 去掉「帮我选一个风格」这类求助分句，再取「这件/这套…」后的品类名 + 场景标签
  const body = cleanedText.split(/\s+/).filter(seg => !/(帮我选|不确定|歧义)/.test(seg)).join(' ')
  const subjectMatch = /(?:这件|这套|这款|这个|这条|这双|这顶|这只|这批)\s*([^\s\d出做拍生成的]{2,8}?)(?=出|做|拍|生成|的|\s|\d|$)/.exec(body)
  if (subjectMatch) {
    const suffix = tags.length ? tags.join('') : (mode === 'ecom-set' ? '详情套图' : '主图')
    return `${subjectMatch[1]}${suffix}`.slice(0, 16)
  }

  const core = body
    .replace(/^(请|帮我|帮忙|麻烦)?(给|为|把)?(这套|这件|这个|这张|上面|当前)?(生成|做一套|出一套|出|做|拍)?(\d+\s*[张屏组套])?/, '')
    .replace(/(不确定|歧义|帮我选).*$/, '')
    .trim()
  if (core) {
    const trimmed = core.replace(/\s+/g, '').slice(0, 14)
    if (trimmed.length >= 2) return trimmed
  }
  return fallbackTag === '视觉出图' ? 'AI 视觉创作' : `${fallbackTag}创作`
}

/** 按字段算张数：count 字段为多选取选中数，否则取数值 */
export function toolCount(def: ToolDef | undefined, params: Record<string, unknown> | undefined, fallback: number) {
  const f = def?.fields?.find((x) => x.count)
  if (!f || !params) return fallback
  const v = params[f.id]
  if (Array.isArray(v)) return Math.max(1, v.length)
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/* ---------------- 实现 ---------------- */

const mockSnapshotSchema = z.array(z.object({
  project: z.object({ id: z.string(), name: z.string(), productIds: z.array(z.string()), updatedAt: z.string(), coverItemId: z.string().optional(), cover: z.object({ id: z.string(), url: z.string(), width: z.number(), height: z.number(), thumbUrl: z.string().optional() }).optional() }),
  items: canvasItemsSchema, messages: chatMessagesSchema,
}))
const MOCK_PROJECTS_KEY = 'v2:mock-projects:v1'

export function createMockDataSource(options: { storage?: Pick<Storage, 'getItem' | 'setItem'>; pause?: (ms: number) => Promise<void>; failOutputIndex?: number } = {}): V2DataSource {
  const pause = options.pause ?? wait
  const storage = () => options.storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
  let hydrated = false
  function hydrate() {
    if (hydrated) return
    hydrated = true
    try {
      const raw = storage()?.getItem(MOCK_PROJECTS_KEY)
      if (!raw) return
      for (const doc of mockSnapshotSchema.parse(JSON.parse(raw))) {
        const index = projects.findIndex(project => project.id === doc.project.id)
        if (index < 0) projects.unshift(doc.project)
        else projects[index] = doc.project
        canvasByProject[doc.project.id] = doc.items.map(item => item.status === 'running'
          ? { ...item, status: 'failed', errorMessage: '演示生成已中断，来源与位置已保留', retryAllowed: false } : item)
        messagesByProject[doc.project.id] = doc.messages
      }
    } catch { /* A stale local demo snapshot must not prevent opening the demo. */ }
  }
  function persist() {
    storage()?.setItem(MOCK_PROJECTS_KEY, JSON.stringify(projects.map(project => ({
      project, items: canvasByProject[project.id] ?? [], messages: messagesByProject[project.id] ?? [],
    }))))
  }
  const runs = new Map<string, { projectId: string; items: CanvasItem[]; message: AssistantMessage }>()
  const retrying = new Set<string>()
  const taskListeners = new Set<(tasks: ActiveTask[]) => void>()
  const collectActiveTasks = (): ActiveTask[] => {
    const active: ActiveTask[] = []
    for (const run of runs.values()) {
      const pName = projects.find(p => p.id === run.projectId)?.name ?? '未命名项目'
      for (const item of run.items) {
        if (item.status !== 'running') continue
        active.push({
          id: item.id,
          projectId: run.projectId,
          projectName: pName,
          title: run.message.steps.find(s => s.itemId === item.id)?.label ?? '图片生成中',
          phase: item.generationPhase ?? 'queued',
          progress: item.progress ?? 0,
          thumbUrl: item.placeholder?.thumbUrl ?? item.placeholder?.url,
          ratio: item.targetSize ? `${item.targetSize.width}:${item.targetSize.height}` : undefined,
          startedAt: item.startedAt ?? nowIso(),
        })
      }
    }
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demoTasks') === '1' && active.length === 0) {
      return [
        {
          id: 'demo_task_1',
          projectId: 'pj_west',
          projectName: '秋日西部 · 蕾丝连衣裙',
          title: 'AI 商品主图 · 第 1 张',
          phase: 'generating',
          progress: 64,
          thumbUrl: M + 'k-701-look01.jpg',
          ratio: '3:4',
          startedAt: nowIso(),
        },
        {
          id: 'demo_task_2',
          projectId: 'pj_tweed',
          projectName: '粗花呢套装 · 上新',
          title: 'AI 电商套图 · 第 2 张',
          phase: 'queued',
          progress: 12,
          thumbUrl: M + 'c10r1.jpg',
          ratio: '3:4',
          startedAt: nowIso(),
        },
      ]
    }
    return active
  }
  const notifyTasks = () => {
    const snapshot = collectActiveTasks()
    taskListeners.forEach(fn => fn(snapshot))
  }
  const demoFailure = () => options.failOutputIndex ?? (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('generationDemo') === 'mixed' ? -1 : undefined)

  const account: Account = { name: '店铺账号（占位）', avatar: M + 'c7.jpg', credits: 39 }

  const historyPreferences = new Map<string, { favorite?: boolean; hidden?: boolean }>()
  const historyRecords = () => generations.filter(g => g.status === 'done' && !historyPreferences.get(g.id)?.hidden).map(g => ({ ...g, favorite: historyPreferences.get(g.id)?.favorite ?? false }))
  const getHistory = async (id: string) => generationDetail(historyRecords(), id)

  const stressCanvases = new Map<string, CanvasItem[]>()
  const stressEnabled = () => process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mockNodes') === '300'
  const projectCanvas = (id: string): CanvasItem[] => {
    if (!stressEnabled()) return canvasByProject[id] ?? []
    if (!stressCanvases.has(id)) stressCanvases.set(id, createStressCanvas(canvasByProject[id] ?? []))
    return stressCanvases.get(id) ?? []
  }
  function storeCanvas(projectId: string, items: CanvasItem[]) {
    if (stressEnabled()) stressCanvases.set(projectId, items)
    else { canvasByProject[projectId] = items; persist() }
  }
  const withCounts = () => categories.map((c) => ({ ...c, count: products.filter((p) => p.categoryId === c.id).length }))

  return {
    ...mockSession(),
    async getAccount() { return account },
    async getComposerOptions() { return composerOptions() },
    async getComposerReferences() { return { models, brandKits } },
    async listTools() { return TOOLS },
    async listToolCatalog() { return TOOL_CATALOG },
    async listCases() {
      const meta: Array<{ title: string; category: CaseExample['category']; aspect: CaseExample['aspect']; prompt: string }> = [
        { title: '秋日草原复古西装大片', category: 'model', aspect: 'tall', prompt: '秋日草原户外阳光，复古西装外套搭配半身裙，胶片质感街拍' },
        { title: '极简棚拍针织连衣裙', category: 'model', aspect: 'square', prompt: '纯色高级灰棚拍，柔和侧逆光，凸显针织肌理与垂坠感' },
        { title: '法式庄园蕾丝度假裙', category: 'style', aspect: 'tall', prompt: '法式庄园午后自然光，蕾丝连衣裙随风微动，氛围感大片' },
        { title: '丹宁牛仔马甲叠穿主图', category: 'main', aspect: 'wide', prompt: '电商主图构图，牛仔马甲叠穿连衣裙，户外木栅栏背景' },
        { title: '木珠流苏腰带细节详情页', category: 'detail', aspect: 'tall', prompt: '服饰配饰详情页海报，突出木珠流苏腰带材质与卖点排版' },
        { title: '蕾丝荷叶领卖点拆解图', category: 'detail', aspect: 'square', prompt: '商品详情页卖点展示，领口蕾丝花边特写与柔和暖调排版' },
        { title: '都市通勤风衣街拍LOOK', category: 'model', aspect: 'tall', prompt: '城市街头清晨光影，卡其色风衣通勤穿搭，自然抓拍感' },
        { title: '静物配饰极简光影主图', category: 'main', aspect: 'wide', prompt: '高质感商品静物主图，立体光影对比，干净留白构图' },
        { title: '设计师买手店橱窗氛围', category: 'style', aspect: 'square', prompt: '极简买手店陈列氛围，暖白建筑光影，高级时尚杂志感' },
        { title: '夏季清凉亚麻套装穿搭', category: 'model', aspect: 'tall', prompt: '夏日海边微风，浅色亚麻套装自然松弛感穿搭' },
        { title: '电商大促首图视觉套版', category: 'detail', aspect: 'wide', prompt: '电商活动主视觉套版，商品居中突出，简洁促销信息层级' },
        { title: '复古胶片感人像Lookbook', category: 'style', aspect: 'tall', prompt: '柯达胶片色调，室内窗边自然光，人物特写与服饰质感' },
      ]
      return meta.map((m, k) => ({
        id: `case${k + 1}`,
        title: m.title,
        category: m.category,
        aspect: m.aspect,
        prompt: m.prompt,
        image: { id: `case${k + 1}`, url: `/v2-mock/c${k + 1}.jpg`, width: 640, height: 857 },
      }))
    },

    async listProjects() { hydrate(); return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    async getProject(id) {
      hydrate()
      const project = projects.find((p) => p.id === id)
      if (!project) return null
      return { project, items: structuredClone(projectCanvas(id)), messages: structuredClone(messagesByProject[id] ?? []) }
    },
    async createProject(input) {
      hydrate()
      const p: Project = { id: uid('pj'), name: input.name || '未命名项目', productIds: input.productIds ?? [], updatedAt: nowIso() }
      projects.unshift(p); canvasByProject[p.id] = []; messagesByProject[p.id] = []
      for (const pid of p.productIds) products.find((x) => x.id === pid)?.projectIds.push(p.id)
      persist(); return p
    },
    async renameProject(id, name) { hydrate(); const p = projects.find((x) => x.id === id); if (p) p.name = name; persist() },
    async saveCanvas(projectId, items, messages) {
      hydrate()
      if (stressEnabled()) { stressCanvases.set(projectId, structuredClone(items)); return }
      canvasByProject[projectId] = structuredClone(items)
      if (messages !== undefined) messagesByProject[projectId] = structuredClone(messages)
      const project = projects.find(value => value.id === projectId)
      if (project) {
        project.updatedAt = nowIso()
        const chosen = project.coverItemId ? items.find(item => item.id === project.coverItemId && item.status !== 'running' && item.status !== 'failed') : undefined
        if (chosen) project.cover = chosen.image
        else { delete project.coverItemId; project.cover = items.find(item => item.status !== 'running' && item.status !== 'failed')?.image }
      }
      persist()
    },
    async setProjectCover(projectId, itemId) {
      hydrate()
      const project = projects.find(p => p.id === projectId)
      const item = projectCanvas(projectId).find(i => i.id === itemId && i.status !== 'running' && i.status !== 'failed' && i.image.url)
      if (!project || !item) throw new Error('图片不存在或尚未完成')
      project.coverItemId = item.id; project.cover = item.image; project.updatedAt = nowIso()
      persist()
      return structuredClone(project)
    },
    async saveCanvasMaterial(projectId, itemId) {
      hydrate()
      const item = projectCanvas(projectId).find(i => i.id === itemId && i.status !== 'running' && i.status !== 'failed' && i.image.url)
      if (!item) throw new Error('图片不存在或尚未完成')
      const existing = materials.find(m => m.image.id === item.image.id)
      if (existing) return existing
      const material: Material = { id: uid('mt'), name: '来自画布', image: structuredClone(item.image), origin: item.ref.type === 'generation' ? 'saved' : 'upload', createdAt: nowIso() }
      materials.unshift(material)
      return material
    },

    async listCategories() { return withCounts() },
    async createCategory(name) { const c = { id: uid('cat'), name, count: 0 }; categories.push(c); return c },
    async listProducts(q: ProductQuery = {}) {
      return products.filter((p) => (!q.categoryId || p.categoryId === q.categoryId) && (!q.search || p.name.includes(q.search)))
    },
    async getProduct(id) { return products.find((p) => p.id === id) ?? null },
    async uploadProduct(files, meta) {
      const images = await Promise.all(files.map(fileToImage))
      const p = P(uid('p'), meta.name || files[0]?.name.replace(/\.\w+$/, '') || '新商品', meta.categoryId, images, 0, [])
      products.unshift(p); return p
    },

    async listModels() { return models },
    async listBrandKits() { return brandKits },
    async listMaterials() { return materials },
    async uploadMaterial(file) {
      const m: Material = { id: uid('mt'), name: file.name, image: await fileToImage(file), origin: 'upload', createdAt: nowIso() }
      materials.unshift(m); return m
    },
    async saveAsMaterial(generationId) {
      const g = generations.find((x) => x.id === generationId)
      if (!g) throw new Error('generation not found')
      const m: Material = { id: uid('mt'), name: '来自生成', image: g.image, origin: 'saved', createdAt: nowIso() }
      materials.unshift(m); return m
    },

    async listGenerations(q: GenerationQuery = {}) { return filterGenerations(historyRecords(), q).generations },
    async listGenerationPage(q = {}) { return filterGenerations(historyRecords(), q) },
    getGeneration: getHistory,
    async setGenerationFavorite(ids, favorite) {
      if (ids.some(id => !historyRecords().some(g => g.id === id))) throw new Error('生成记录不存在')
      for (const id of ids) historyPreferences.set(id, { ...historyPreferences.get(id), favorite })
    },
    async deleteGenerations(ids) {
      if (ids.some(id => !historyRecords().some(g => g.id === id))) throw new Error('生成记录不存在')
      for (const id of ids) historyPreferences.set(id, { ...historyPreferences.get(id), hidden: true })
    },
    downloadGenerations: ids => downloadGenerationArchive(ids, getHistory),

    async sendMessage(projectId, input, onEvent) {
      hydrate()
      const existingReplies = (messagesByProject[projectId] ?? []).filter(m => m.role === 'assistant' || m.role === 'ask')
      const firstRoundTitle = existingReplies.length === 0 ? summarizeProjectTitle(input.text, input.attachments, input.mode) : undefined
      const user: ChatMessage = { id: uid('u'), role: 'user', text: input.text, attachments: input.attachments, createdAt: nowIso() }
      messagesByProject[projectId] = [...(messagesByProject[projectId] ?? []), user]
      onEvent({ type: 'message', message: user })

      const applyAutoTitle = (title?: string) => {
        if (!title) return
        const p = projects.find(x => x.id === projectId)
        if (p && p.name === '未命名项目') {
          p.name = title
          if (!stressEnabled()) persist()
        }
      }

      const isAskReply = input.text.startsWith('Q：')
      const needsClarification = !isAskReply && /(歧义|帮我选|不确定)/.test(input.text)
      if (needsClarification) {
        await pause(400)
        applyAutoTitle(firstRoundTitle)
        const ask: AskMessage = {
          id: uid('ask'),
          role: 'ask',
          ...(firstRoundTitle ? { title: firstRoundTitle } : {}),
          createdAt: nowIso(),
          reason: '你的描述里还没有确定画面风格与光线方向，先确认一个方向可以避免返工：',
          question: '这组图片希望采用哪种视觉基调？',
          options: [
            { key: 'A', label: '自然日光外景', description: '户外实景感，突出商品真实质感与穿搭氛围' },
            { key: 'B', label: '极简影棚纯色底', description: '干净纯色背景，聚焦廓形、面料与工艺细节' },
            { key: 'C', label: '高级杂志棚拍', description: '强明暗对比与造型张力，适合品牌大片主图' },
          ],
          otherPlaceholder: '填写其他场景、色调或构图要求…',
        }
        messagesByProject[projectId] = [...(messagesByProject[projectId] ?? []), ask]
        onEvent({ type: 'message', message: structuredClone(ask) })
        if (!stressEnabled()) persist()
        onEvent({ type: 'done' })
        return
      }

      const parents = [...new Set(input.attachments.flatMap(attachment => {
        const item = projectCanvas(projectId).find(item => item.id === attachment.id || item.image.id === attachment.image.id)
        return item ? [item.id] : []
      }))]
      const modelLabel = composerOptions().models.find(m => m.id === input.generation?.modelId)?.name ?? 'Nano Banana 2'
      const ratioStr = input.generation?.ratio ?? '3:4'
      const resStr = (input.generation?.resolution ?? '2k').toUpperCase()
      const thinkMsg: AssistantMessage = {
        id: uid('a'),
        role: 'assistant',
        createdAt: nowIso(),
        steps: [{ label: '输出中…', icon: 'think', status: 'running' }],
        results: [],
      }
      messagesByProject[projectId] = [...(messagesByProject[projectId] ?? []), thinkMsg]
      onEvent({ type: 'message', message: structuredClone(thinkMsg) })

      await pause(280)
      if (firstRoundTitle) {
        thinkMsg.title = firstRoundTitle
        applyAutoTitle(firstRoundTitle)
      }
      thinkMsg.steps = [
        { label: '画布读取完成', icon: 'doc', status: 'done' },
        { label: '思考完成', icon: 'think', status: 'running' },
      ]
      messagesByProject[projectId] = (messagesByProject[projectId] ?? []).map(m => m.id === thinkMsg.id ? structuredClone(thinkMsg) : m)
      onEvent({
        type: 'message-update',
        id: thinkMsg.id,
        patch: { steps: structuredClone(thinkMsg.steps), ...(firstRoundTitle ? { title: firstRoundTitle } : {}) },
      })

      await pause(320)
      thinkMsg.steps = [
        { label: '画布读取完成', icon: 'doc', status: 'done' },
        {
          label: '思考完成',
          icon: 'think',
          status: 'done',
          collapsible: true,
          detail: `已解析画布上下文与参考图结构，按 ${ratioStr}（${resStr}）规格规划生成，使用 ${modelLabel} 并行出图。`,
        },
        { label: `使用 ${modelLabel} 生成图片`, icon: 'image', status: 'done' },
      ]
      messagesByProject[projectId] = (messagesByProject[projectId] ?? []).map(m => m.id === thinkMsg.id ? structuredClone(thinkMsg) : m)
      onEvent({ type: 'message-update', id: thinkMsg.id, patch: { steps: structuredClone(thinkMsg.steps) } })

      await generate(
        projectId,
        input.generation?.count ?? (input.mode === 'ecom-set' ? 6 : 4),
        input.mode === 'ecom-set' ? 'AI 电商套图' : 'AI 商品主图',
        onEvent,
        sourceImage(projectId, input.attachments),
        parents,
        '',
        input.generation ? { ratio: input.generation.ratio, resolution: input.generation.resolution } : {},
        undefined,
        modelLabel,
      )
    },

    async listActiveTasks() {
      return collectActiveTasks()
    },

    subscribeTasks(listener) {
      taskListeners.add(listener)
      listener(collectActiveTasks())
      return () => { taskListeners.delete(listener) }
    },

    async runTool(projectId, toolId, itemIds, onEvent, params) {
      hydrate()
      if (toolId === 'describe') {
        await pause(900)
        onEvent({ type: 'message', message: { id: uid('a'), role: 'assistant', createdAt: nowIso(), steps: [{ label: '反推提示词', icon: 'doc' }], results: [],
          body: '图片描述（mock）：商品主体清晰，柔光，自然场景。可修改提示词后继续创作。' } })
        onEvent({ type: 'done' })
        return
      }
      const base = toolId.split(':')[0]
      const def = TOOLS.find((t) => t.id === base)
      const count = base === 'layer-split' ? 3 : toolCount(def, params, base === 'detail-page' ? 6 : itemIds.length || 1)
      const srcItem = projectCanvas(projectId).find(item => itemIds.includes(item.id))
      const sources = (itemIds.length > 1 && base !== 'fuse' ? itemIds.map(id => [id]) : [itemIds]).map(ids => ({
        parents: referenceParents(projectCanvas(projectId), ids, params),
        placeholder: projectCanvas(projectId).find(item => item.id === ids[0])?.image ?? srcItem?.image ?? sourceImage(projectId, []),
      }))
      await generate(projectId, sources.length > 1 ? toolCount(def, params, 1) : count, def?.name ?? '图片生成', onEvent,
        srcItem?.image ?? sourceImage(projectId, []), sources[0]?.parents ?? [], toolId, params, sources)
    },

    async retryToolRun(projectId, runId, onEvent) {
      const run = runs.get(runId)
      if (!run || run.projectId !== projectId || retrying.has(runId)) return
      const failed = run.items.filter(item => item.status === 'failed' && item.retryAllowed)
      if (!failed.length) return
      retrying.add(runId)
      try {
        for (const item of failed) {
          update(run, item, { status: 'running', generationPhase: 'queued', progress: 0, startedAt: nowIso(), errorMessage: undefined, retryAllowed: false }, onEvent)
        }
        await simulate(run, onEvent, failed)
      } finally { retrying.delete(runId) }
    },
  }

  /** 生成中垫底用的图：优先本次附件，其次项目的第一个商品图 */
  function sourceImage(projectId: string, atts: ChatAttachment[]): ImageRef | undefined {
    const a = atts.find((x) => x.image?.url && (x.kind === 'upload' || x.kind === 'product')) ?? atts.find((x) => x.image?.url)
    if (a) return a.image
    const pid = projects.find((p) => p.id === projectId)?.productIds[0]
    return products.find((p) => p.id === pid)?.images[0]
  }

  async function generate(projectId: string, count: number, label: string, onEvent: (event: AgentEvent) => void,
    placeholder?: ImageRef, parents: string[] = [], toolId = '', params: ToolParams = {}, sources = [{ parents, placeholder }], modelLabel = 'Nano Banana 2') {
    const occupied = [...projectCanvas(projectId)]
    const runId = uid('mock-run')
    const pool = ['k-701-look01.jpg', 'k-701-look02.jpg', 'k-701-look05b.jpg', 'k-701-look08.jpg', 'k-705-look12-shot_1.jpg', 'k-705-look12-shot_2.jpg']
    const items = sources.flatMap(source => {
      const anchor = occupied.find(item => item.id === source.parents[0])
      const targetSize = generationTarget(source.placeholder ?? { width: 1100, height: 1473 }, toolId, params)
      const w = anchor ? anchor.w * targetSize.width / Math.max(1, anchor.image.width) : 150
      const placed = placeResults(occupied, Array.from({ length: count }, (_, index): CanvasItem => ({
        id: uid('ci'), ref: { type: 'generation', id: uid('g') }, image: img(pool[index % pool.length], 1100, 1473),
        x: 0, y: 0, w, targetSize, parentId: source.parents[0], parentIds: source.parents,
        status: 'running', generationPhase: 'queued', progress: 0, placeholder: source.placeholder,
        toolRunId: runId, startedAt: nowIso(), createdAt: nowIso(), estimatedDurationMs: 7000,
      })))
      occupied.push(...placed)
      return placed
    })
    const ratioStr = typeof params.ratio === 'string' ? params.ratio : '3:4'
    const resStr = typeof params.resolution === 'string' ? params.resolution.toUpperCase() : '2K'
    const targetSize = items[0]?.targetSize ?? { width: 1536, height: 2048 }
    const specText = `${ratioStr} · ${targetSize.width}×${targetSize.height} · ${modelLabel} · ${resStr}`
    const message: AssistantMessage = {
      id: uid('a'),
      role: 'assistant',
      createdAt: nowIso(),
      streaming: true,
      steps: items.map((item, index) => ({ itemId: item.id, label: `${label} · 第 ${index + 1} 张`, icon: 'image' as const })),
      results: [],
    }
    const run = { projectId, items, message, specText }
    runs.set(runId, run)
    storeCanvas(projectId, occupied.map(item => structuredClone(item)))
    items.forEach(item => onEvent({ type: 'item-add', item: structuredClone(item) }))
    messagesByProject[projectId] = [...(messagesByProject[projectId] ?? []), message]
    onEvent({ type: 'message', message: structuredClone(message) })
    publish(run, onEvent)

    const failure = demoFailure()
    await simulate(run, onEvent, items, failure === -1 ? items.length - 1 : failure)
  }

  function publish(run: { projectId: string; items: CanvasItem[]; message: AssistantMessage; specText?: string }, onEvent: (event: AgentEvent) => void) {
    run.message.results = run.items.map(item => ({
      id: item.ref.id,
      itemId: item.id,
      status: item.status ?? 'running',
      ...(item.progress !== undefined ? { progress: item.progress } : {}),
      ...(item.generationPhase ? { generationPhase: item.generationPhase } : {}),
      ...(item.targetSize ? { targetSize: item.targetSize } : {}),
      ...(item.status === 'done' ? { image: item.image } : {}),
    }))
    const done = run.items.filter(item => item.status === 'done').length
    const failed = run.items.filter(item => item.status === 'failed').length
    const running = run.items.filter(item => item.status === 'running').length
    if (running > 0) {
      run.message.body = `${done} / ${run.items.length} 张已完成${failed ? `，${failed} 张失败` : ''}`
    }
    messagesByProject[run.projectId] = (messagesByProject[run.projectId] ?? []).map(message => message.id === run.message.id ? structuredClone(run.message) : message)
    if (!stressEnabled()) persist()
    onEvent({ type: 'message-update', id: run.message.id, patch: structuredClone(run.message) })
    notifyTasks()
  }

  function update(run: { projectId: string; items: CanvasItem[]; message: AssistantMessage; specText?: string }, item: CanvasItem, patch: Partial<CanvasItem>, onEvent: (event: AgentEvent) => void) {
    Object.assign(item, patch)
    storeCanvas(run.projectId, projectCanvas(run.projectId).map(current => current.id === item.id ? mergeGenerationItem(current, patch) : current))
    onEvent({ type: 'item-update', id: item.id, patch: structuredClone(patch) })
    publish(run, onEvent)
  }

  async function simulate(run: { projectId: string; items: CanvasItem[]; message: AssistantMessage; specText?: string }, onEvent: (event: AgentEvent) => void, items: CanvasItem[], failIndex?: number) {
    await Promise.all(items.map(async (item, index) => {
      await pause(1600 + index * 350)
      update(run, item, { generationPhase: 'generating', progress: 8 }, onEvent)
      for (const progress of [26, 48, 72, 91]) {
        await pause(1100 + index * 100)
        update(run, item, { progress }, onEvent)
      }
      update(run, item, { generationPhase: 'processing', progress: 95 }, onEvent)
      await pause(1200)
      update(run, item, index === failIndex
        ? { status: 'failed', errorMessage: '图片处理未完成，请重试这张图片。', retryAllowed: true }
        : { status: 'done', image: item.image, progress: 100, retryAllowed: false }, onEvent)
    }))

    // 将生成步骤标记为完成
    run.message.steps = run.message.steps.map(s => (s.itemId || s.status !== 'running' ? s : { ...s, status: 'done' }))
    const done = run.items.filter(item => item.status === 'done').length
    const failed = run.items.filter(item => item.status === 'failed').length
    const finalText = `已为你完成 ${done} 张图片生成${failed ? `（另有 ${failed} 张未完成，可在画布中免费重试）` : ''}。点击上方缩略图可直接定位到画布对应位置，也可以点下方建议快速微调。`

    // 使用定时器分段模拟打字机流式回复
    const chunks = finalText.match(/.{1,12}/g) ?? [finalText]
    let acc = ''
    run.message.streaming = true
    for (const chunk of chunks) {
      acc += chunk
      run.message.body = acc
      messagesByProject[run.projectId] = (messagesByProject[run.projectId] ?? []).map(m => m.id === run.message.id ? structuredClone(run.message) : m)
      onEvent({ type: 'message-update', id: run.message.id, patch: { steps: structuredClone(run.message.steps), body: acc, streaming: true } })
      await pause(55)
    }

    run.message.streaming = false
    run.message.meta = {
      spec: run.specText ?? '3:4 · 1536×2048 · Nano Banana 2',
      highlights: [
        '严格锁定商品主体版型、材质纹理与关键细节',
        '统一光影色温与构图比例，保证同批次视觉连贯',
        '保留画布溯源关系，支持单张局部微调或高清放大',
      ],
      suggestions: ['再出一组近景细节图', '背景光影更柔和一些', '换成极简纯色棚拍背景'],
    }
    messagesByProject[run.projectId] = (messagesByProject[run.projectId] ?? []).map(m => m.id === run.message.id ? structuredClone(run.message) : m)
    if (!stressEnabled()) persist()
    onEvent({ type: 'message-update', id: run.message.id, patch: structuredClone(run.message) })
    notifyTasks()
    onEvent({ type: 'done' })
  }

}

function fileToImage(file: File): Promise<ImageRef> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => resolve({ id: uid('img'), url, width: el.naturalWidth, height: el.naturalHeight })
    el.onerror = () => resolve({ id: uid('img'), url, width: 1000, height: 1000 })
    el.src = url
  })
}

export type { AgentMode }

/* ---------------- AI 工具广场（原型，mock） ---------------- */
// 封面全部是占位图 + CSS 效果示意，接线后换成每个工具真实的「前 / 后」案例图

const TC = (id: string, name: string, cat: ToolCategoryId, desc: string, cover: ToolCover, inputs: string[], output: string, extra: Partial<ToolCatalogItem> = {}): ToolCatalogItem => ({
  id, name, category: cat, desc, cover, inputs, output, status: 'ready', cost: 4, ...extra,
})

export const TOOL_CATEGORIES: { id: ToolCategoryId; name: string }[] = [
  { id: 'model', name: '主图与模特' },
  { id: 'detail', name: '详情页' },
  { id: 'style', name: '款式设计' },
  { id: 'retouch', name: '修图' },
  { id: 'fabric', name: '面料与家纺' },
  { id: 'util', name: '实用工具' },
]

export const TOOL_CATALOG: ToolCatalogItem[] = [
  // 主图与模特
  TC('705', '多机位裂变', 'model', '一张主图，16 种机位一键成套', { fx: 'grid', before: M + 'k-705-look12-shot_1.jpg', after: M + 'k-705-look12-shot_2.jpg', extra: [M + 'k-705-look12-shot_3.jpg', M + 'k-705-look12-shot_4.jpg'] }, ['服装主图'], '多机位套图', { featured: true }),
  TC('706', '姿势裂变', 'model', '同一模特，换姿势换角度', { fx: 'split', before: M + 'c3.jpg', after: M + 'c4.jpg' }, ['服装模特图'], '多姿势套图'),
  TC('80262', '模特换衣', 'model', '把衣服穿到任意模特身上', { fx: 'split', before: M + 'c5r1.jpg', after: M + 'c5.jpg' }, ['人物底图', '服装图', '细节图（可选）'], '试穿图', { featured: true }),
  TC('709', '批量换衣', 'model', '多模特 × 多件衣服，一次排列组合', { fx: 'grid', before: M + 'c6.jpg', after: M + 'c7.jpg', extra: [M + 'c8.jpg', M + 'c9.jpg'] }, ['人物图组', '服装图组'], '组合换衣结果'),
  TC('702', '元素替换', 'model', '只换环境、鞋子或模特，其余不动', { fx: 'split', before: M + 'c10r1.jpg', after: M + 'c10.jpg' }, ['原图', '替换对象参考图'], '指定元素替换后的主图'),
  // 详情页
  TC('80232', 'AI 详情页', 'detail', '1–10 屏统一风格，可拼长图', { fx: 'stack', before: M + 'k-80232-s1.jpg', after: M + 'k-80232-s2.jpg', extra: [M + 'k-80232-s3.jpg'] }, ['产品图', '细节图（可选）'], '整套详情页', { featured: true, cost: 12 }),
  TC('80231', '仿详情图', 'detail', '照着参考版式，出同款详情图', { fx: 'split', before: M + 'k-80232-s3.jpg', after: M + 'k-80232-s1.jpg' }, ['商品图', '版式参考图'], '参考版式成图'),
  TC('707', '详情图裂变', 'detail', '白底、3D 悬浮、部位特写等 23 种', { fx: 'grid', before: M + 'c11r1.jpg', after: M + 'c11.jpg', extra: [M + 'c11r2.jpg', M + 'c12r1.jpg'] }, ['商品图'], '电商套图'),
  // 款式设计
  TC('80212', '面料换色', 'style', '换花型、换颜色，版型不变', { fx: 'tint', before: M + 'c2.jpg', after: M + 'c2.jpg' }, ['服装图', '面料或颜色'], '换色后的服装图', { featured: true }),
  TC('80305', '配色方案', 'style', '一件商品，批量出多套配色', { fx: 'swatch', before: M + 'c9r1.jpg', after: M + 'c9r1.jpg' }, ['服装商品图', '配色（文字或参考图）'], '每个配色一张图'),
  TC('80213', '参考改款', 'style', '借参考款的领口、袖型做改款', { fx: 'split', before: M + 'c3r1.jpg', after: M + 'c3r2.jpg' }, ['改款参考图', '原款图'], '改款方案'),
  TC('80216', '款式裂变', 'style', '一个爆款，衍生多个新方案', { fx: 'grid', before: M + 'c4r1.jpg', after: M + 'c4r2.jpg', extra: [M + 'c6r1.jpg', M + 'c6r2.jpg'] }, ['原款图'], '多方案款式图'),
  TC('80217', '多款混合', 'style', '2–10 张款式图融成新款', { fx: 'split', before: M + 'c8r1.jpg', after: M + 'c8r2.jpg' }, ['款式参考图 ×2–10'], '混合新款'),
  TC('80215', '生产线稿', 'style', '服装图转白底平面款式线稿', { fx: 'sketch', before: M + 'c12r2.jpg', after: M + 'c12r2.jpg' }, ['服装图（单面）'], '白底款式线稿'),
  TC('80238', '虚拟样机', 'style', '图案、Logo 贴到商品上，带光影', { fx: 'logo', before: M + 'c7r1.jpg', after: M + 'c7r1.jpg' }, ['商品底图', '图案或 Logo'], '样机效果图'),
  // 修图
  TC('80244', '一键抠图', 'retouch', '去掉背景，导出透明 PNG', { fx: 'cutout', before: M + 'c1.jpg', after: M + 'c1.jpg' }, ['原图'], '透明 PNG', { status: 'config', cost: 1 }),
  TC('80242', '高清放大', 'retouch', '画质增强到 4K', { fx: 'blur', before: M + 'k-look05-face.jpg', after: M + 'k-look05-face.jpg' }, ['待放大图片'], '4K 增强图', { cost: 2 }),
  TC('80240', '局部修复', 'retouch', '修掉手指、褶皱等局部瑕疵', { fx: 'split', before: M + 'k-701-look05b.jpg', after: M + 'k-701-look02.jpg' }, ['原图', '细节参考图（可选）'], '修复后的图'),
  TC('80243', '去水印', 'retouch', '清掉水印与文字，还原面料', { fx: 'mark', before: M + 'k-701-look08.jpg', after: M + 'k-701-look08.jpg' }, ['原图'], '干净的图', { cost: 2 }),
  TC('80239', '参考图校色', 'retouch', '按参考图统一整组色调', { fx: 'tint', before: M + 'c6r3.jpg', after: M + 'c6r3.jpg' }, ['待校色图', '色彩参考图'], '校色后的图', { cost: 2 }),
  TC('80245', '转矢量', 'retouch', '图案、标志重绘为可编辑 SVG', { fx: 'sketch', before: M + 'c2r3.jpg', after: M + 'c2r3.jpg' }, ['原图'], 'SVG 文件', { cost: 3 }),
  // 面料与家纺
  TC('80301', '花型提取', 'fabric', '从衣服上抠出平面花型，可四方连续', { fx: 'tile', before: M + 'c2r1.jpg', after: M + 'c2r1.jpg' }, ['带花型的服装图'], '平面花型'),
  TC('80302', '去布纹颗粒', 'fabric', '三档清理布纹，印花颜色不变', { fx: 'blur', before: M + 'c2r2.jpg', after: M + 'c2r2.jpg' }, ['面料图'], '平整的面料图', { cost: 2 }),
  TC('80303', '家纺场景裂变', 'fabric', '床品多机位、多场景套图', { fx: 'grid', before: M + 'c10r2.jpg', after: M + 'c12.jpg', extra: [M + 'c11.jpg', M + 'c10.jpg'] }, ['家纺主图', '细节图（可选）'], '最多 15 张场景图'),
  TC('80304', '被套花型裂变', 'fabric', '平铺花型设计 + 床品实拍套图', { fx: 'tile', before: M + 'c9r2.jpg', after: M + 'c9r2.jpg' }, ['原花型或成品图'], '花型或场景套图'),
  // 实用工具
  TC('80263', '反推提示词', 'util', '看图写出可复用的中文提示词', { fx: 'text', before: M + 'k-banner01.jpg', after: M + 'k-banner01.jpg' }, ['图片'], '一段提示词', { cost: 1 }),
  TC('80264', '海报转描述', 'util', '拆解海报构图、排版和风格', { fx: 'text', before: M + 'k-80232-s2.jpg', after: M + 'k-80232-s2.jpg' }, ['海报图'], '一段描述', { cost: 1 }),
]
