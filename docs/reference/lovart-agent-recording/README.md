# Lovart 2.0 Agent 交互录屏静态帧

来源：用户录屏 PixPin_2026-11-16_15-18-18（159 秒，1440×774），按关键状态抽 10 帧。仅作交互参考，不进产品代码、不复制其视觉。

| 帧 | 时间 | 状态 |
|---|---|---|
| [01-home-input](01-home-input.jpg) | 0:00.0 | 首页：大输入框（@ 引用图片 chip）+ 场景 chip + 实用工具卡片 |
| [02-chat-start](02-chat-start.jpg) | 0:09.0 | 提交后进入全宽纯对话视图，标题自动生成，尚无画布；灰色步骤行「输出中…」 |
| [03-question-card](03-question-card.jpg) | 1:02.5 | 发现歧义：一句解释 + 结构化提问卡（A/B/C + 其它说明，跳过/提交），贴在输入框上方 |
| [04-answer-echo](04-answer-echo.jpg) | 1:05.5 | 回答以用户气泡回显「Q:… A:…」，助手继续 |
| [05-layout-generating](05-layout-generating.jpg) | 1:15.5 | 布局切换：左窄对话 + 中间「参考」面板 + 右画布按最终比例放灰色「生成中」占位 |
| [06-generating](06-generating.jpg) | 1:43.0 | 生成中：步骤行「使用 GPT Image 2.6 Sunburst 生成图片」，对话内小占位同步 |
| [07-result-canvas](07-result-canvas.jpg) | 2:26.0 | 出图：画布大图 + 对话缩略图，积分实时扣减 |
| [08-reference-sources](08-reference-sources.jpg) | 2:32.0 | 左侧参考来源 tab（Pinterest 等） |
| [09-plugin-panel](09-plugin-panel.jpg) | 2:35.0 | 参考面板的插件推广（Clipper） |
| [10-result-reply](10-result-reply.jpg) | 2:38.0 | 结果回复：规格 3:4 1536×2048、「这一版落实的几点」逐条、调整方向、赞/踩；输入框上方会员横幅 |

## 我们的决定（2026-11-16）
- 画布不主动展开：生成过程和结果先留在对话里（步骤行 + 按比例占位 + 缩略图），用户点对话里的图片才展开画布并定位到该图。
- 歧义先弹结构化提问卡，可跳过。
- 结果回复带规格、逐条落实、下一步建议、赞踩。
