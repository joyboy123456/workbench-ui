# 给编码 Agent 的约定

- 这是纯界面仓库：不要新增后端接口或接入真实账号；数据只走 `useV2()`（`src/frontend/lib/v2/data-source.tsx`），新数据先加到 `src/frontend/lib/v2/mock.ts`。
- 不改 `V2DataSource` 接口的已有方法签名，以便合回主仓库；需要新数据就加可选方法。
- 视觉：默认浅色，支持在账号菜单切换深色；V2 样式写在 `src/frontend/app/v2/styles/`，限定在 `.v2` 下；图片直角、按原始比例显示。
- 高频参数（模型、比例、清晰度、张数、开关）不藏进折叠；选项 2 个用开关/分段，≤5 个平铺，6–10 个用下拉，>10 个下拉加搜索。
- 数据为空时区块不消失，显示占位。
- 产品名用中文功能名；不拷竞品代码与素材。
- 每次改完跑 `pnpm typecheck` 和 `pnpm test`，禁止 `@ts-ignore`、`as any`、`.skip`、`.only`。
