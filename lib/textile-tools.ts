import type { TextileProductionSettings } from './textile-production'

/** 技术手册中五项面料/家纺功能在本工作台的编号和输入契约。 */
export const TEXTILE_TOOL_IDS = [80301, 80302, 80303, 80304, 80305] as const
export type TextileToolId = (typeof TEXTILE_TOOL_IDS)[number]
export const HOME_TEXTILE_CATEGORIES = ['被套', '四件套', '床旗', '靠垫'] as const
export const COLOR_SCHEME_CATEGORIES = ['上衣', '裤子', '裙子', '套装'] as const
export const DEFAULT_QUILT_SCENARIOS = ['北欧', '复古']
export const GRAIN_STRENGTHS = ['light', 'standard', 'strong'] as const
/** 图1为主图，其余图片只补充同一套商品的细节。 */
export const HOME_TEXTILE_MAX_INPUT_IMAGES = 4

export interface TextileSettings extends TextileProductionSettings {
  seamless?: boolean
  strength?: (typeof GRAIN_STRENGTHS)[number]
  /** 80301：提取、仿创，或保留可见图案并补全缺失部分。 */
  patternMode?: 'extract' | 'recreate' | 'restore'
  /** 80301：底色——原色底不透明，或洋红抠图底由后处理转透明。 */
  patternBackground?: 'original' | 'transparent'
  variantCount?: number
  /** 多图展开后每个独立任务冻结一个序号，范围为 1～variantCount。 */
  variantIndex?: number
  scenarios?: string[]
  withSwatch?: boolean
  variantDirections?: string[]
  /** 服务端编译后冻结，历史任务没有此字段。 */
  patternMatte?: 'magenta'
  patternOutput?: 'opaque-v1'
  paletteOutput?: 'separate'
  grainOutput?: 'edge-preserving-v1' | 'pattern-flatten-v2'
  textileMode?: 'scene' | 'camera'
  cameraViews?: string[]
  quiltOutput?: 'periodic-v1'
}

export const HOME_TEXTILE_CAMERAS = [
  { id: '45_degree_overhead', label: '45度俯视', prompt: '45度斜上方俯视机位：摄影师移动到床尾右前方，把相机升至床面上方约1.5米，镜头向下倾斜约45度拍向床头。床的中轴线在画面中形成对角线，床头位于画面偏左上、床尾偏右下，大面积床面清楚可见，同时看到床尾和一侧垂落的被套，不能仍是左右对称的正面平视。原房间物件的身份与实际布局保持一致，它们在画面内的位置、大小和遮挡关系应随新机位自然变化，不能为了保持像素位置退回原视角。' },
  { id: 'close_up_foot_bed', label: '床尾局部特写', prompt: '床尾局部特写：相机靠近床尾，被套垂落的床尾边缘、下摆和相邻被面占据大部分画面，清楚展示面料花纹与缝线。裁掉床头和大部分房间，不展示整张床，不输出卧室全景。' },
  { id: 'close_up_shot', label: '床品近景特写', prompt: '床品近景特写：相机靠近枕头与被套交叠处，从斜上方拍摄枕套、被套的纹理、图案和接缝，织物占据几乎整个画面。不展示整张床，不输出房间全景。' },
  { id: 'front', label: '正面平视', prompt: '正面平视机位：从床尾正前方看向床头，床品主体居中，保留完整床品展示。' },
  { id: 'side', label: '侧面', prompt: '从床侧拍摄，清楚表现床侧被套垂落和床面纵深，不沿用床尾正面视角。' },
  { id: 'overhead', label: '正上方俯拍', prompt: '相机位于床面正上方，垂直向下俯拍，床面呈平面展开，展示被套与枕头的整体排布。' },
  { id: 'pillow_detail', label: '枕套细节', prompt: '枕套局部特写，枕套的花型、接缝和封边占据主体，裁掉床尾及房间全景。' },
  { id: 'fabric_detail', label: '被面细节', prompt: '被面面料微距特写，展示原有印花、织纹与缝线，面料充满画面，不展示整床。' },
  { id: 'quit_on_floor', label: '垂落地面', prompt: '床品摆放状态调整：被子一侧约三分之一自然垂落至地面，褶皱顺着床沿垂到地上，床品一部分搭在床沿、一部分在床上自然延展，两个枕头随意摆放在床上。保持原房间环境、床品款式、面料图案与光线不变，只改变床品摆放状态，不刻意整理。' },
  { id: '45_degree_flat', label: '45度平视', prompt: '45度平视机位：摄影师移动到床的斜侧方，相机保持与床面大致等高的平视高度，从侧面约45度角看向整张床。完整展示整张床与一侧垂落的床品，床的纵深清晰可见。原房间物件的身份与实际布局保持一致，它们在画面内的位置、大小和遮挡关系随新机位自然变化，不能退回床尾正面平视。' },
  { id: 'overhead_close_up_view', label: '俯拍散乱近景', prompt: '正上方俯拍贴床近景：相机贴近床面从正上方向下拍摄，枕头散乱地平放在床上，被子呈自然慵懒的褶皱、无刻意整理的松弛感。画面几乎只保留床品，背景只露出小部分。严格保持原有面料质感、图案、颜色与密度不变。' },
  { id: 'overhead_panoramic_view', label: '空中俯拍全景', prompt: '从床面上方较高位置向下俯拍，完整展示整套床品以及周围房间布局，保留床头、床尾与床侧环境，不裁成局部特写。保持原房间物件与床品的实际位置关系，透视随观察角度自然变化。' },
  { id: 'close_up_headborard', label: '床头枕区特写', prompt: '相机从床尾方向正对床头，靠近枕头区域拍摄超近景；枕头、枕套和附近被面占据主体，只露出少量床头环境。保持原有花型与接缝，不展示整张床或床尾。' },
  { id: 'fabric_close_up', label: '被面起伏微距', prompt: '相机贴近被子表面，以斜切45度拍摄被面自然波浪褶皱和面料肌理，焦点在被面而不是床尾。面料铺满画幅，保留原花型颜色、比例和质感，不展示整床。' },
  { id: 'floor_close_up', label: '落地床品特写', prompt: '将原图同一套被子自然散放在原房间地面上，两个枕头放在被子上并部分叠压。从斜上方45度近距离拍摄，画面几乎只展示被子与枕头，突出折叠处的面料纹理和光感。保持床品款式、图案、颜色和比例不变。' },
] as const

export function readTextileMode(value: unknown): 'scene' | 'camera' {
  if (value === undefined || value === 'scene') return 'scene'
  if (value === 'camera') return 'camera'
  throw new Error('家纺裂变模式无效')
}

export function readPatternMode(value: unknown): NonNullable<TextileSettings['patternMode']> {
  if (value === undefined || value === 'extract') return 'extract'
  if (value === 'recreate') return 'recreate'
  if (value === 'restore') return 'restore'
  throw new Error('花型来源无效')
}

export function readPatternBackground(value: unknown): 'original' | 'transparent' {
  if (value === undefined || value === 'original') return 'original'
  if (value === 'transparent') return 'transparent'
  throw new Error('花型底色无效')
}

export function readTextileCameras(value: unknown, count: number): string[] {
  if (value === undefined) return HOME_TEXTILE_CAMERAS.slice(0, count).map(view => view.id)
  if (!Array.isArray(value) || value.length !== count
    || value.some(id => !HOME_TEXTILE_CAMERAS.some(view => view.id === id))
    || new Set(value).size !== value.length) throw new Error('每张图需要一个有效且不重复的机位')
  return [...value]
}

export function defaultTextileDirections(toolId: number): readonly string[] {
  return toolId === 80303 ? HOME_TEXTILE_DIRECTIONS : COLOR_SCHEME_DIRECTIONS
}

export function readTextileDirections(toolId: number, value: unknown, count: number): string[] {
  if (value === undefined) return defaultTextileDirections(toolId).slice(0, count)
  if (!Array.isArray(value) || value.length !== count
    || value.some(item => typeof item !== 'string' || !item.trim() || [...item.trim()].length > 160)) {
    throw new Error('每张图需要一个方案方向，数量应与成图数量一致，每项最多160字')
  }
  const directions = value.map(item => item.trim())
  if (new Set(directions).size !== directions.length) throw new Error('方案方向不能重复，请为每张图设置不同方向')
  return directions
}

export function isTextileToolId(id: unknown): id is TextileToolId {
  return typeof id === 'number' && (TEXTILE_TOOL_IDS as readonly number[]).includes(id)
}

export function readQuiltScenarios(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_QUILT_SCENARIOS]
  if (!Array.isArray(value) || value.length < 1 || value.length > 8
    || value.some(item => typeof item !== 'string' || !item.trim() || [...item.trim()].length > 80)) {
    throw new Error('请填写 1～8 个花型风格，每个不超过 80 字')
  }
  const scenarios = value.map(item => item.trim())
  if (new Set(scenarios).size !== scenarios.length) throw new Error('花型风格不能重复')
  return scenarios
}

export function textileVariantCount(toolId: TextileToolId, value: unknown, scenarios?: unknown): number {
  const count = toolId === 80304 ? readQuiltScenarios(scenarios).length
    : value ?? ([80303, 80305].includes(toolId) ? 3 : 1)
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 8) {
    throw new Error('生成数量必须为 1～8 的整数')
  }
  if ([80301, 80302].includes(toolId) && count !== 1) throw new Error('此工具每次处理 1 张图片')
  if (toolId === 80304 && value !== undefined && value !== count) throw new Error('花型数量必须与风格列表一致')
  return count
}

export const HOME_TEXTILE_DIRECTIONS = [
  '北欧原木卧室，晨间柔和自然光，正面平视',
  '现代简约卧室，中性漫射光，45度侧面',
  '复古卧室，暖色台灯与自然阴影，斜侧视角',
  '日式素雅卧室，柔和窗光，轻俯视',
  '法式浅色卧室，午后侧逆光，近景',
  '现代酒店卧室，均匀暖光，宽幅构图',
  '侘寂风卧室，灰调软装，漫射天光',
  '清新田园卧室，明亮日光，床尾视角',
]
export const COLOR_SCHEME_DIRECTIONS = [
  '低饱和暖色同色系，主色奶油米白 #EDE0C8、辅色浅驼 #BD9E7C',
  '低饱和冷色同色系，主色雾蓝 #8199AB、辅色浅灰 #D5D9DC',
  '中性色对比，主色炭黑 #343434、辅色米白 #F3EADD',
  '自然植物色，主色鼠尾草绿 #A7B9A5、辅色燕麦 #D4C3A9',
  '暖色对比，主色砖红 #A95345、辅色深棕 #624437',
  '清新浅色，主色淡紫 #C5B6D8、辅色珍珠白 #F5F0E8',
  '经典深色，主色海军蓝 #283D59、辅色浅卡其 #C7B895',
  '柔和粉色，主色豆沙粉 #BF8E91、辅色暖灰 #AEA29A',
]
