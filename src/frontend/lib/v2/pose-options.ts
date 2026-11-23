export const POSE_OPTIONS = [
  { id: 'stand', label: '正面站立' },
  { id: 'walk', label: '走动' },
  { id: 'side', label: '侧身' },
  { id: 'back', label: '回头' },
  { id: 'sit', label: '坐姿' },
  { id: 'lean', label: '倚靠' },
  { id: 'hip', label: '叉腰' },
  { id: 'pocket', label: '手插兜' },
] as const

export function poseInstruction(label: string) {
  return `只改变人物姿势：${label}。保持商品、人物身份和场景一致。`
}
