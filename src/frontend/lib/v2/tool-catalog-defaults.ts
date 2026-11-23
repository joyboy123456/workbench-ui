import type { ToolCatalogItem, ToolCategoryId, ToolCover } from './types'

const M = '/v2-mock/'

const TC = (id: string, name: string, cat: ToolCategoryId, desc: string, cover: ToolCover, inputs: string[], output: string, extra: Partial<ToolCatalogItem> = {}): ToolCatalogItem => ({
  id, name, category: cat, desc, cover, inputs, output, status: 'ready', cost: 4, ...extra,
})

export const TOOL_CATALOG: ToolCatalogItem[] = [
  // 主图与模特
  TC('701', 'AI服装大片主图', 'model', '上传商品图直出商业大片', { fx: 'split', before: M + 'k-701-look05b.jpg', after: M + 'k-701-look02.jpg' }, ['服装商品主图', '模特参考图（可选）'], '商业大片主图', { featured: true }),
  TC('705', '主图多机位裂变', 'model', '一张主图，多机位一键成套', { fx: 'grid', before: M + 'k-705-look12-shot_1.jpg', after: M + 'k-705-look12-shot_2.jpg', extra: [M + 'k-705-look12-shot_3.jpg', M + 'k-705-look12-shot_4.jpg'] }, ['服装主图'], '多机位套图', { featured: true }),
  TC('706', '模特姿势裂变', 'model', '同一模特，换姿势换角度', { fx: 'split', before: M + 'c3.jpg', after: M + 'c4.jpg' }, ['服装模特图'], '多姿势套图'),
  TC('80262', '智能模特试穿', 'model', '把衣服穿到任意模特身上', { fx: 'split', before: M + 'c5r1.jpg', after: M + 'c5.jpg' }, ['人物底图', '服装图', '细节图（可选）'], '试穿图', { featured: true }),
  TC('709', '多模特批量试穿', 'model', '多模特 × 多件衣服，一次排列组合', { fx: 'grid', before: M + 'c6.jpg', after: M + 'c7.jpg', extra: [M + 'c8.jpg', M + 'c9.jpg'] }, ['人物图组', '服装图组'], '组合换衣结果'),
  TC('702', '商品图局部换元素', 'model', '只换环境、鞋子或模特，其余不动', { fx: 'split', before: M + 'c10r1.jpg', after: M + 'c10.jpg' }, ['原图', '替换对象参考图'], '指定元素替换后的主图'),
  TC('80210', '多场景批量换品', 'model', '上传新商品与多张场景底图', { fx: 'grid', before: M + 'c10r1.jpg', after: M + 'c10.jpg', extra: [M + 'c11.jpg', M + 'c12.jpg'] }, ['新商品主体图', '待换品场景图 1'], '多场景换品成图'),
  TC('80258', '鞋包百货批量换品', 'model', '针对鞋包配饰与百货小件', { fx: 'split', before: M + 'c7r1.jpg', after: M + 'c7r1.jpg' }, ['小商品图', '目标场景底图 1'], '小件换品成图'),
  // 详情页
  TC('80232', '智能多屏详情页', 'detail', '1–10 屏统一风格，可拼长图', { fx: 'stack', before: M + 'k-80232-s1.jpg', after: M + 'k-80232-s2.jpg', extra: [M + 'k-80232-s3.jpg'] }, ['产品图', '细节图（可选）'], '整套详情页', { featured: true, cost: 12 }),
  TC('80231', '参考版式仿图', 'detail', '照着参考版式，出同款详情图', { fx: 'split', before: M + 'k-80232-s3.jpg', after: M + 'k-80232-s1.jpg' }, ['商品图', '版式参考图'], '参考版式成图'),
  TC('80265', '长图详情整套仿制', 'detail', '按多张参考详情屏逐屏仿制版式', { fx: 'stack', before: M + 'k-80232-s2.jpg', after: M + 'k-80232-s1.jpg', extra: [M + 'k-80232-s3.jpg'] }, ['自家商品主图', '参考详情屏 1'], '整套仿制详情图', { cost: 10 }),
  TC('707', '详情卖点套图裂变', 'detail', '白底、3D 悬浮、部位特写套图', { fx: 'grid', before: M + 'c11r1.jpg', after: M + 'c11.jpg', extra: [M + 'c11r2.jpg', M + 'c12r1.jpg'] }, ['商品图'], '电商套图'),
  // 款式设计
  TC('80212', '面料换花与同款改色', 'style', '换花型、换颜色，版型不变', { fx: 'tint', before: M + 'c2.jpg', after: M + 'c2.jpg' }, ['服装图', '面料或颜色'], '换色后的服装图', { featured: true }),
  TC('80305', '商品多色延展', 'style', '一件商品，批量出多套配色', { fx: 'swatch', before: M + 'c9r1.jpg', after: M + 'c9r1.jpg' }, ['服装商品图', '配色（文字或参考图）'], '每个配色一张图'),
  TC('80213', '参考元素改款', 'style', '借参考款的领口、袖型做改款', { fx: 'split', before: M + 'c3r1.jpg', after: M + 'c3r2.jpg' }, ['改款参考图', '原款图'], '改款方案'),
  TC('80216', '单款衍生设计', 'style', '一个爆款，衍生多个新方案', { fx: 'grid', before: M + 'c4r1.jpg', after: M + 'c4r2.jpg', extra: [M + 'c6r1.jpg', M + 'c6r2.jpg'] }, ['原款图'], '多方案款式图'),
  TC('80217', '多款融合设计', 'style', '2–10 张款式图融成新款', { fx: 'split', before: M + 'c8r1.jpg', after: M + 'c8r2.jpg' }, ['款式参考图 ×2–10'], '混合新款'),
  TC('80215', '服装制版平面线稿', 'style', '服装图转白底平面款式线稿', { fx: 'sketch', before: M + 'c12r2.jpg', after: M + 'c12r2.jpg' }, ['服装图（单面）'], '白底款式线稿'),
  TC('80238', '图案印花样机', 'style', '图案、Logo 贴到商品上，带光影', { fx: 'logo', before: M + 'c7r1.jpg', after: M + 'c7r1.jpg' }, ['商品底图', '图案或 Logo'], '样机效果图'),
  // 修图
  TC('80244', '智能净底抠图', 'retouch', '去掉背景，导出透明 PNG', { fx: 'cutout', before: M + 'c1.jpg', after: M + 'c1.jpg' }, ['原图'], '透明 PNG', { status: 'config', cost: 1 }),
  TC('80242', '超清画质增强', 'retouch', '画质增强到 4K', { fx: 'blur', before: M + 'k-look05-face.jpg', after: M + 'k-look05-face.jpg' }, ['待放大图片'], '4K 增强图', { cost: 2 }),
  TC('80240', '画面瑕疵精修', 'retouch', '修掉手指、褶皱等局部瑕疵', { fx: 'split', before: M + 'k-701-look05b.jpg', after: M + 'k-701-look02.jpg' }, ['原图', '细节参考图（可选）'], '修复后的图'),
  TC('80243', '画面水印文字清理', 'retouch', '清掉水印与文字，还原面料', { fx: 'mark', before: M + 'k-701-look08.jpg', after: M + 'k-701-look08.jpg' }, ['原图'], '干净的图', { cost: 2 }),
  TC('80239', '参考色调追色', 'retouch', '按参考图统一整组色调', { fx: 'tint', before: M + 'c6r3.jpg', after: M + 'c6r3.jpg' }, ['待校色图', '色彩参考图'], '校色后的图', { cost: 2 }),
  TC('80245', '矢量图形重绘', 'retouch', '图案、标志重绘为可编辑 SVG', { fx: 'sketch', before: M + 'c2r3.jpg', after: M + 'c2r3.jpg' }, ['原图'], 'SVG 文件', { cost: 3 }),
  // 面料与家纺
  TC('80301', '印花平铺提取', 'fabric', '从衣服上抠出平面花型，可四方连续', { fx: 'tile', before: M + 'c2r1.jpg', after: M + 'c2r1.jpg' }, ['带花型的服装图'], '平面花型'),
  TC('80302', '面料去布纹提纯', 'fabric', '三档清理布纹，印花颜色不变', { fx: 'blur', before: M + 'c2r2.jpg', after: M + 'c2r2.jpg' }, ['面料图'], '平整的面料图'),
  TC('80303', '家纺多场景裂变', 'fabric', '床品多机位、多场景套图', { fx: 'grid', before: M + 'c10r2.jpg', after: M + 'c12.jpg', extra: [M + 'c11.jpg', M + 'c10.jpg'] }, ['家纺主图', '细节图（可选）'], '最多 15 张场景图'),
  TC('80304', '床品花型裂变', 'fabric', '平铺花型设计 + 床品实拍套图', { fx: 'tile', before: M + 'c9r2.jpg', after: M + 'c9r2.jpg' }, ['原花型或成品图'], '花型或场景套图'),
  // 视频创作
  TC('80233', '带货视频分镜复刻', 'video', '拆解参考视频分镜节奏', { fx: 'split', before: M + 'k-705-look12-shot_1.jpg', after: M + 'k-705-look12-shot_2.jpg' }, ['参考爆款视频', '商品主图', '模特参考图（可选）'], '结构冻结复刻脚本与同款视频', { featured: true, cost: 16 }),
  // 实用工具
  TC('80263', '画面提示词反推', 'util', '看图写出可复用的中文提示词', { fx: 'text', before: M + 'k-banner01.jpg', after: M + 'k-banner01.jpg' }, ['图片'], '一段提示词', { cost: 1 }),
  TC('80264', '海报版式拆解', 'util', '拆解海报构图、排版和风格', { fx: 'text', before: M + 'k-80232-s2.jpg', after: M + 'k-80232-s2.jpg' }, ['海报图'], '一段描述', { cost: 1 }),
]
