import { POSE_OPTIONS } from './pose-options'
import type { ToolCategoryId, ToolDef, ToolField } from './types'

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
  { id: 'erase', name: '智能消除', surfaces: ['selection', 'slash'], icon: 'erase', backendToolId: 80248, overlay: 'mask', cost: 2,
    tip: '涂掉要去除的东西（水印、杂物、路人），背景自动补齐。',
    fields: [{ id: 'brush', label: '画笔', kind: 'slider', min: 6, max: 60, default: 28 }] },
  { id: 'cutout', name: '一键抠图', surfaces: ['selection', 'batch', 'home', 'slash'], icon: 'cut', backendToolId: 80244, cost: 1 },
  { id: 'pose', name: '换姿势', surfaces: ['selection', 'slash'], icon: 'pose', backendToolId: 706, cost: 4,
    tip: '人物、服装和背景不变，只换姿势。每选一个姿势出一张。',
    fields: [
      { id: 'poses', label: '姿势', kind: 'chips', multi: true, count: true, default: ['walk', 'side'],
        options: [...POSE_OPTIONS] },
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

export const TOOL_CATEGORIES: { id: ToolCategoryId; name: string }[] = [
  { id: 'model', name: '主图与模特' },
  { id: 'detail', name: '详情页' },
  { id: 'style', name: '款式设计' },
  { id: 'retouch', name: '修图' },
  { id: 'fabric', name: '面料与家纺' },
  { id: 'util', name: '实用工具' },
]
