# Workbench V2 前端

独立的画布式电商素材工作台。界面来自主仓库的 V2 工作区（基于 `8450e8c7`，含当时尚未提交的前端更新）。启动后自动使用演示账号。项目和对话保存在当前浏览器，上传的演示素材使用 IndexedDB，生成结果使用仓库内的示例图片和视频。

## 本地运行

需要 Node.js 22.13 或更新版本。

```bash
npm ci
npm run dev
```

打开 http://localhost:3000，首页自动进入 `/v2`。

| 路径 | 内容 |
| --- | --- |
| `/v2` | 商拍首页、创作输入框、常用工具、最近项目 |
| `/v2/projects` | 项目列表 |
| `/v2/canvas/<id>` | Agent 对话、方案确认、画布编辑与素材抽屉 |
| `/v2/assets` | 商品、模特、品牌、素材及生成记录 |
| `/v2/tools` | AI 工具目录 |

## 开发

- `app/v2` 存放路由与样式，`components/v2` 存放页面和组件。
- `lib/v2/data-source.tsx` 定义数据接口，`lib/v2/mock.ts` 提供本地演示实现。真实账号、Agent 执行及供应商调用由主仓库负责。
- `public/v2-mock` 和 `public/v2-tool-previews` 存放演示素材。

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
