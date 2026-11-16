# V2 前端（画布铺满 + 资产库）

路由都在 `/v2` 下，不碰 `/studio`、`/workbench`。

| 路由 | 页面 |
|---|---|
| `/v2` | 首页：输入框、常用工具、最近项目、做同款 |
| `/v2/projects` | 项目列表 |
| `/v2/canvas/[id]` | 画布：浮动对话面板、选中工具条、右键菜单、框选批量、资产抽屉 |
| `/v2/assets?tab=products\|models\|brand\|materials\|history` | 资产：商品、模特、品牌、素材、生成记录 |
| `/v2/assets/products/[id]` | 商品详情 |

## 接线

1. 实现 `lib/v2/data-source.tsx` 里的 `V2DataSource` 接口（调 `/api/...`）。
2. `components/v2/root.tsx` 使用 `createV2DataSource()`：`NEXT_PUBLIC_V2_SOURCE=api` 选真实实现，其他情况使用业务 mock。页面代码不用改。
3. Agent 和工具的进度统一走 `AgentEvent` 事件流（新消息、消息更新、加图、图更新、报错、完成）。SSE 或 WebSocket 转成这些事件推给 `onEvent` 就行。
4. 数据形状在 `lib/v2/types.ts`。资产和项目的关系是：项目通过 `productIds` 引用商品；生成结果 `Generation` 带 `projectId` 和 `productIds`，生成记录就是跨项目查它。

## 访客与账号

- `/v2` 和 `/v2/tools` 允许匿名浏览，工具与案例目录只公开精确匹配的 GET；项目、资产、生成记录、执行、上传继续鉴权。
- 页面上的发送、上传、工具、新建、项目/资产入口经 `useV2Auth().requireAuth(action)` 处理：访客原地登录/邀请码注册，成功后续接一次，取消保留输入。
- `V2DataSource` 的 `getSession/login/register` 在 mock 和 api 下都走现有 Cookie 账号接口。mock 只模拟业务数据；访客不读取私有账号、项目或资产。
- 直达受保护页面沿用 `/login?next=…`。实现与验收边界见 [.scratch/v2-parity-g7/spec.md](../../.scratch/v2-parity-g7/spec.md)。

## 约定

- 样式只写在 `app/v2/v2.css`，所有选择器都以 `.v2` 开头，配色是 Codex 暗色（强调色 #339CFF，主按钮白底）。
- 画布用 `@xyflow/react`。图片直角、按原比例显示，按原像素 × 统一缩放落位（`CANVAS_SCALE = 150/1100`），默认不画连线；`parentIds` 保存来源画布元素，兼容旧 `parentId`，`toolRunId` 关联生成批次。连线开关与「查看来源」只读这些关系。新结果经 `arrange.ts` 的 `placeResults` 在来源右侧避让，完成/刷新保留既有位置。
- `lib/v2/fit.ts`：适配视图时，左边让出对话面板，右边可以让出资产抽屉。
- mock 图在 `public/v2-mock/`，接线后可以删掉。

## 调研资料

接线遇到拿不准的交互或数据问题，先看 `docs/v2-research/README.md`（已定结论加竞品实测笔记）。

## 视觉参考

界面长什么样以 `docs/v2-design/README.md` 为准：高保真原型（浏览器直接打开，`?s=1..9`）、原型截图和 V2 现状截图。
