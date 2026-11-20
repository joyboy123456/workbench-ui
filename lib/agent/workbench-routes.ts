import { WORKBENCH_CLOTHING_TOOLS } from '@/lib/clothing-tool-catalog'
import { isImageTextToolId } from '@/lib/clothing-tool-compiler'
import { clothingToolLabel } from '@/lib/clothing-tool-label'

/** Agent 尚不能代执行、先交给工作台对应工具完成的能力；名称与输入角色取自工作台目录。 */
export interface WorkbenchRoute {
  id: string
  toolId: number
  name: string
  /** 模型据此选择：做什么。适用：…。不用于：…（改用「其他能力名称」）。 */
  description: string
  inputs: readonly string[]
  delivery: 'image' | 'text'
}

/** 已由 Agent 技能直接执行的工作台工具：服装大片、主图裂变、姿势裂变、详情图裂变。 */
export const AGENT_EXECUTED_WORKBENCH_TOOL_IDS: readonly number[] = Object.freeze([701, 705, 706, 707])

const ROUTE_DEFINITIONS: ReadonlyArray<readonly [id: string, toolId: number, description: string]> = [
  ['clone-product-layout', 80231, '按一张版式参考图，为自己的商品生成同版式的商品图或详情图，商品身份保持一致。适用：用户给出商品图和要照着做的参考图。不用于：没有参考图、从零生成多屏详情页（改用「AI商品详情页」）；只换图中某个元素（改用「商品图元素替换」）。'],
  ['replace-element', 702, '在已有服装大片上只替换一类元素：服装、环境、模特或鞋子，其余保持。适用：用户给出原图和替换对象参考图。不用于：让模特穿上指定服装并重新设定场景（改用「模特换衣（智能提示词）」）；多人多衣组合（改用「批量换衣」）；文字描述的小范围修补（改用「局部修复」）。'],
  ['product-detail-page', 80232, '从商品图生成 1～10 屏风格统一的商品详情页，可按屏下载或拼长图。适用：用户要整套详情页，可附细节图和指定模特。不用于：照着某张参考图的版式做（改用「智能仿商品图/详情图」）；只要领口、面料等局部特写（改用「服装细节图」）。'],
  ['model-dressing', 80262, '让人物底图中的模特穿上参考服装，按场景描述生成试穿图，保持人物身份与服装细节。适用：一位人物配一件服装。不用于：多位人物与多件服装逐一组合（改用「批量换衣」）；只换掉原图里的衣服而场景人物不动（改用「商品图元素替换」）；没有人物底图的商拍（改用「服装大片」）。'],
  ['batch-dressing', 709, '人物图组与服装图组逐一组合换衣，各 1～4 张，每件服装可绑定自己的细节图。适用：需要多个人物与多件服装的组合结果。不用于：单人单衣且要描述场景（改用「模特换衣（智能提示词）」）。'],
  ['fabric-swap', 80212, '把服装的面料花型换成参考图的花型，或保持面料只换颜色。适用：用户给出服装图和面料花型参考，或要求同料换色。不用于：批量出多种配色方案（改用「商品配色方案」）；改领型袖型等款式结构（改用「参考改款」）；把图案或标志贴到商品上（改用「虚拟样机」）。'],
  ['reference-redesign', 80213, '按参考款式图，把原款的指定部位改成参考款的设计。适用：用户给出原款图和改款参考图并指明部位。不用于：没有参考图、想要多个改款方向（改用「单图款式裂变」）；融合三张以上款式（改用「多款式混合」）；只换面料花型（改用「面料花型替换 / 同料换色」）。'],
  ['production-line-art', 80215, '把服装图转成结构清晰的白底平面生产款式线稿，一次一面。适用：用户要线稿、款式图、工艺图。不用于：把图案或标志转成可编辑矢量文件（改用「转矢量」）；提取面料上的印花（改用「面料花型提取」）。'],
  ['style-variation', 80216, '基于一张爆款服装图生成保留核心设计的多个新款方案，可出平铺白底或模特宫格。适用：只有一张原款图，想要改款灵感或裂变。不用于：有明确的改款参考图（改用「参考改款」）；多张款式互相融合（改用「多款式混合」）；同一款式出多机位套图（改用「服装套图裂变」）。'],
  ['style-mix', 80217, '融合 2～10 张款式参考图，生成各部位来源明确的新款式。适用：用户给出多张款式并说明想融合。不用于：只有一张原款（改用「单图款式裂变」）；一张原款加一张参考并限定部位（改用「参考改款」）。'],
  ['mockup', 80238, '把图案或标志贴到商品底图上，按位置、大小、角度生成贴合光影的样机效果图。适用：用户给出商品底图和图案素材。不用于：整件服装更换面料花型（改用「面料花型替换 / 同料换色」）。'],
  ['color-scheme', 80305, '为服装商品批量生成配色方案，可用文字配色或参考图配色，支持商品与配色的组合矩阵。适用：用户要多种颜色版本。不用于：只换成一种指定面料或花型（改用「面料花型替换 / 同料换色」）；让一张图的色调向另一张看齐（改用「参考图校色」）。'],
  ['color-match', 80239, '参考目标图片的色彩，对待处理图片校色，结构与纹理保持。适用：两张图色调不一致需要统一。不用于：给商品换颜色或出配色（改用「商品配色方案」）。'],
  ['local-repair', 80240, '按文字指明的位置修复图片里的局部错误或缺失细节，可附细节参考图。适用：手指、纽扣、接缝等局部瑕疵。不用于：清除水印和遮挡文字（改用「去水印」）；整体变清晰（改用「高清放大」）；替换整件服装或背景（改用「商品图元素替换」）。'],
  ['upscale', 80242, '把一张图片增强到 4K 档位，属于生成式增强，纹理与五官需人工核对。适用：图片模糊、分辨率不够。不用于：生成领口袖口等局部特写图（改用「服装细节图」）；修某一处瑕疵（改用「局部修复」）。'],
  ['remove-watermark', 80243, '清除图片上的水印与文字遮挡，并还原底下的面料肌理。适用：图片带水印、演示标记或遮挡文字。不用于：修复非遮挡类的局部瑕疵（改用「局部修复」）；去掉布料本身的纹理颗粒（改用「去除布纹颗粒」）。'],
  ['vectorize', 80245, '把图案、标志或平面图形重绘为可下载的 SVG 矢量文件。适用：用户要矢量图、可编辑图形。不用于：服装的生产款式线稿（改用「生产款式线稿」）；从衣服上取出印花图案（改用「面料花型提取」）。'],
  ['pattern-extract', 80301, '从服装或面料图提取平面花型，去掉款式、褶皱和光影，可选四方连续接版。适用：用户要花型、印花、图案素材。不用于：只清理面料图上的布纹颗粒（改用「去除布纹颗粒」）；把花型换到另一件衣服上（改用「面料花型替换 / 同料换色」）；转成矢量文件（改用「转矢量」）。'],
  ['remove-fabric-grain', 80302, '按轻微、标准或强力清理面料图上的布纹颗粒，保留印花图案与颜色。适用：扫描或翻拍的面料图有布纹。不用于：从成衣上取出花型（改用「面料花型提取」）；清除水印文字（改用「去水印」）。'],
  ['home-textile-variation', 80303, '为家纺产品生成不同机位、场景或参考风格的套图，可附细节、模特与宠物图。适用：床品、家纺主图的场景与机位裂变。不用于：从花型出发设计被套（改用「被套花型裂变」）；服装类商品的套图（改用「服装套图裂变」）。'],
  ['duvet-pattern-variation', 80304, '从原花型或成品图出发，生成平铺花型设计，或床品实拍场景套图。适用：被套、四件套的花型开发与上床效果。不用于：已有家纺成品图、只换机位和场景（改用「家纺风格裂变」）。'],
  ['image-to-prompt', 80263, '分析一张图片的元素、构图、风格、色彩与光影，输出一段可复用的中文生成提示词，不生成图片。适用：用户要反推提示词。不用于：带大量文字排版的海报（改用「海报图转描述」）。'],
  ['poster-to-text', 80264, '分析海报的构图、文字排版与创作风格，输出一段可复刻的中文描述，不生成图片。适用：用户要拆解或描述一张海报。不用于：普通图片反推提示词（改用「图反推提示词」）。'],
]

function buildRoute([id, toolId, description]: (typeof ROUTE_DEFINITIONS)[number]): WorkbenchRoute {
  const tool = WORKBENCH_CLOTHING_TOOLS.find(item => item.id === toolId)
  // 工具被隐藏或下线时在加载期暴露，不留下指向空入口的路由。
  if (!tool) throw new Error(`工作台路由 ${id} 指向不可用的工具 ${toolId}`)
  return Object.freeze({
    id,
    toolId,
    name: clothingToolLabel(toolId),
    description,
    inputs: Object.freeze([...tool.inputs]),
    delivery: isImageTextToolId(toolId) ? 'text' : 'image',
  })
}

export const WORKBENCH_ROUTES: readonly WorkbenchRoute[] = Object.freeze(ROUTE_DEFINITIONS.map(buildRoute))

const ROUTES_BY_ID: ReadonlyMap<string, WorkbenchRoute> = new Map(WORKBENCH_ROUTES.map(route => [route.id, route]))

/** 只接受注册表中的标识；未知值一律返回 undefined。 */
export function findWorkbenchRoute(id: string): WorkbenchRoute | undefined {
  return ROUTES_BY_ID.get(id)
}

/** 入口地址由注册表生成，沿用工作台已有的 tool 深链；模型不能提供地址。 */
export function workbenchRouteHref(route: Pick<WorkbenchRoute, 'toolId'>): string {
  return `/?tool=${route.toolId}`
}

/** 新请求冻结的能力版本；缺省的历史输入不带目录，也不产生入口。 */
export const WORKBENCH_ROUTING_VERSION = 'workbench-routes-v1' as const

/** 随本轮结果保存并展示给用户的入口；全部字段来自服务端注册表。 */
export interface WorkbenchRouteHandoff {
  id: string
  toolId: number
  name: string
  href: string
  inputs: string[]
  delivery: WorkbenchRoute['delivery']
}

export function workbenchRouteHandoff(route: WorkbenchRoute): WorkbenchRouteHandoff {
  return { id: route.id, toolId: route.toolId, name: route.name, href: workbenchRouteHref(route),
    inputs: [...route.inputs], delivery: route.delivery }
}

/** 固定文案，不含模型原文；不依赖界面是否渲染入口卡片。 */
export function workbenchHandoffMessage(route: Pick<WorkbenchRoute, 'name' | 'inputs'>): string {
  const upload = route.inputs.length ? `，上传：${route.inputs.join('、')}` : ''
  return `「${route.name}」目前需要在工作台完成，对话里还不能直接处理。请进入工作台的「${route.name}」工具${upload}。本轮没有创建任何任务。`
}
