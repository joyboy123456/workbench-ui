import { CLOTHING_TOOLS } from '@/lib/clothing-tool-catalog'

/** 侧栏与面板标题共用的工具显示名，保证两处一致。 */
const TOOL_LABEL_OVERRIDES: Record<number, string> = {
  701: 'AI 商品主图',
  702: '商品图元素替换',
  80215: '生产款式线稿',
}

export function clothingToolLabel(id: number, fallback?: string): string {
  return TOOL_LABEL_OVERRIDES[id] ?? CLOTHING_TOOLS.find((tool) => tool.id === id)?.name ?? fallback ?? ''
}
