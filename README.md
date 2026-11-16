# 电商素材工作台 · 前端

纯前端仓库：只有界面和本地 mock 数据，不接后端、不登录、不调用生图接口，用来快速迭代界面效果。

- 来源：主仓库 `/v2` 页面（G1–G7 合并版 `0eeb3edf`）。
- 数据：`lib/v2/mock.ts`，存在浏览器 localStorage；生成结果是占位图（`public/v2-mock/`）。
- 接口：`lib/v2/data-source.tsx` 的 `V2DataSource` 与主仓库保持一致，改好的界面可以原样合回去。

## 运行

```bash
npm install
npm run dev        # http://localhost:3000 → 自动跳到 /v2
npm run typecheck  # tsc
npm test           # node:test 单测
npm run build
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/v2/` | 路由：首页、项目、画布 `/v2/canvas/[id]`、资产、工具；样式 `v2.css` |
| `components/v2/` | 页面与组件；画布在 `components/v2/canvas/` |
| `lib/v2/` | 类型、mock 数据源、画布排版/历史/生成状态等纯逻辑 |
| `public/v2-mock/` | mock 图片 |

## 页面

- `/v2` 首页（输入框 + 案例做同款）
- `/v2/projects` 项目列表
- `/v2/canvas/<id>` 画布 + 对话面板
- `/v2/assets` 资产（商品、模特、品牌、素材、生成记录）
- `/v2/tools` AI 工具
