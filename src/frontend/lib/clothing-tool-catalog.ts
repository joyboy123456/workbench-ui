import catalog from "./clothing-tool-catalog.json";
import type { FeatureType } from "./types";
export interface ClothingTool {
  id: number;
  name: string;
  group: string;
  description: string;
  featureType: FeatureType | null;
  inputs: string[];
  output: string;
  stage: "connected" | "utility" | "preview";
  /** 当前试用入口状态；实际处理仍由服务端鉴权与供应商配置控制。 */
  availability?: "credentials-required";
}
export const CLOTHING_TOOLS = catalog as ClothingTool[];
/** 暂时下线的工具：入口隐藏、深链回落，实现保留。抠图（80244）依赖的阿里云凭据暂不可用。 */
export const HIDDEN_CLOTHING_TOOL_IDS: ReadonlySet<number> = new Set([80244]);
/** 上传框和参考图卡片的抠图编辑入口。独立工具页面的恢复见 docs/archive/workbench-previews/README.md。 */
export const CUTOUT_EDITOR_ENABLED = false;
export const isHiddenClothingTool = (id: number) => HIDDEN_CLOTHING_TOOL_IDS.has(id);
export const WORKBENCH_CLOTHING_TOOLS = CLOTHING_TOOLS.filter(
  (tool) => tool.stage !== "preview" && !isHiddenClothingTool(tool.id),
);
export const clothingToolForFeature = (feature: FeatureType) =>
  CLOTHING_TOOLS.find((t) => t.featureType === feature);
export const TOOL_STAGE_LABELS = {
  connected: "已接流程",
  utility: "已有工具",
  preview: "界面预览",
} as const;
