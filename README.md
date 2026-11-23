# Workbench V2 前端

独立的画布式电商素材工作台。最新界面来自主仓库的 `f3187cae` 和同步时的本地前端更新。启动后自动使用演示账号。项目、对话和画布可在当前浏览器刷新后恢复，生成结果使用仓库内的示例图片和视频。

## 本地运行

需要 Node.js 22.13 或更新版本。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 [本地工作台](http://localhost:5173)。首页、项目、画布、素材库和 AI 工具都在 `/#/v2` 下。

## 开发与导入

`src/frontend/app/` 存放路由与样式，`src/frontend/components/v2/` 存放界面组件，`src/frontend/lib/v2/mock.ts` 提供本地演示数据源。授权的服装大片图片和视频保存在 `src/frontend/public/v2-mock/fashion/`。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Caffeine 的 GitHub 导入使用 `joyboy123456/workbench-ui`，Git ref 填 `main`。前端构建生成 `src/frontend/dist/`。Caffeine 清单所需的 Motoko canister 使用空 actor。
