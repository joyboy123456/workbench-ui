import { TEXTILE_TOOL_IDS } from './textile-tools'

import { V2_IMAGE_OP_TOOL_IDS } from './v2-image-ops'

export const EXECUTABLE_CLOTHING_TOOL_IDS = [
  702, 709, 80213, 80215, 80216, 80217, 80231, 80232, 80239, 80240, 80242, 80243, 80262,
  80263, 80264, 80238, 80245,
  ...V2_IMAGE_OP_TOOL_IDS,
  ...TEXTILE_TOOL_IDS,
] as const

export const IMAGE_TEXT_TOOL_IDS = [80263, 80264] as const

export type ImageTextToolId = (typeof IMAGE_TEXT_TOOL_IDS)[number]

export function isImageTextToolId(id: unknown): id is ImageTextToolId {
  return typeof id === 'number' && (IMAGE_TEXT_TOOL_IDS as readonly number[]).includes(id)
}

export type ExecutableClothingToolId = (typeof EXECUTABLE_CLOTHING_TOOL_IDS)[number]

export function isExecutableClothingToolId(id: unknown): id is ExecutableClothingToolId {
  return typeof id === 'number' && (EXECUTABLE_CLOTHING_TOOL_IDS as readonly number[]).includes(id)
}
