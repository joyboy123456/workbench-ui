interface ToolPreviewPanel {
  src: string
  label?: string
  position?: string
  fit?: 'contain'
}

interface HomeToolPreview {
  layout: 'angles' | 'try-on' | 'detail' | 'fabric' | 'pose'
  title: string
  description: string
  panels: ToolPreviewPanel[]
}

const PREVIEWS = '/v2-tool-previews/'
export const HOME_TOOL_ORDER = ['705', '80262', '80232', '80212', '706'] as const

export const HOME_TOOL_PREVIEWS: Readonly<Partial<Record<string, HomeToolPreview>>> = {
  '705': {
    layout: 'angles',
    title: '多机位裂变',
    description: '同一套新中式服装的全身、半身和近摄画面',
    panels: [
      { src: PREVIEWS + 'angle-full.webp', position: '50% 76%' },
      { src: PREVIEWS + 'angle-portrait.webp', position: '66% 34%' },
      { src: PREVIEWS + 'angle-close.webp' },
    ],
  },
  '80262': {
    layout: 'try-on',
    title: '模特换衣',
    description: '黑色连衣裙的商品图与模特上身效果',
    panels: [
      { src: PREVIEWS + 'try-on-garment.webp', fit: 'contain' },
      { src: PREVIEWS + 'try-on-look.webp', position: '50% 40%' },
    ],
  },
  '80232': {
    layout: 'detail',
    title: 'AI 详情页',
    description: '同款外套的商品参考、上身效果和领口纹理',
    panels: [
      { src: PREVIEWS + 'detail-garment.webp', position: '30% 22%' },
      { src: PREVIEWS + 'detail-look.webp', label: '上身', position: '50% 27%' },
      { src: PREVIEWS + 'detail-knit.webp', label: '细节' },
    ],
  },
  '80212': {
    layout: 'fabric',
    title: '面料换色',
    description: '同款毛呢外套的炭灰色与酒红色对照',
    panels: [
      { src: PREVIEWS + 'fabric-charcoal.webp', position: '50% 40%' },
      { src: PREVIEWS + 'fabric-wine.webp', position: '50% 40%' },
    ],
  },
  '706': {
    layout: 'pose',
    title: '姿势裂变',
    description: '同一模特穿着同一件羽绒服，从收步变为迈步',
    panels: [
      { src: PREVIEWS + 'pose-start.webp', position: '52% 84%' },
      { src: PREVIEWS + 'pose-stride.webp', position: '55% 17%' },
    ],
  },
}
