export const GPT_IMAGE_26 = {
  sunburst: 'gpt-image-2.6-sunburst',
  flare: 'gpt-image-2.6-flare',
} as const

export type GptImage26Model = typeof GPT_IMAGE_26[keyof typeof GPT_IMAGE_26]

export function isGptImage26(model: string | undefined): boolean {
  const id = model?.trim().toLowerCase().replace(/^openai\//, '')
  return id === GPT_IMAGE_26.sunburst || id === GPT_IMAGE_26.flare
}
