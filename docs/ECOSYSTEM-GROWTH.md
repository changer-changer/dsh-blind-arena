# DSH Blind Arena：生态增长与发布作战卡

这不是“保证爆火”的承诺，而是一套可以被复现、被审阅、被社区接力的发布方案。目标是让第一次看到项目的人在 30 秒内明白它解决什么问题，在 3 分钟内完成一次零成本体验，在 10 分钟内愿意把它分享给正在比较 Agent 的人。

## 我们从近期 DSH 生态看到的有效模式

### 1. 先用一个极窄的痛点获得记忆点

`dsh-conversation-exporter` 只解决“把对话整理成可读 Markdown”这一件事；`dsh-find-plugin` 只解决“找到插件并给出可复制安装命令”。它们的共同点不是功能多，而是用户能立刻复述价值。

Arena 的一句话应该固定为：

> 让你在不知道模型名字的情况下，先评判 Agent 的工作，再揭晓赢家。

### 2. 把发现、安装和成功体验串成一条链

`awesome-dsh-plugin` 通过双语目录、可安装命令和明确的收录门槛降低发现成本；`dsh-find-plugin` 把 GitHub topic 搜索、星标排序和安装命令做成了一个动作。Arena 要同时准备：npm 安装、GitHub 安装、零成本 demo、首张截图、一个可复制的真实任务。

### 3. 信任是产品能力，不是营销形容词

`oh-my-dsh` 强调 overlay 而不是 fork，并把“可演进但不自授权”写进产品原则；Arena 已经有同样的结构优势：匿名字段不进公开 wire type、`secrets.json` 延迟到 reveal 才合并、所有 lane 共用验证命令。发布材料要展示这些可审阅的证据，不要写无法验证的“最公平”“最强模型”。

### 4. 让 demo 证明闭环，而不是播放进度条

Arena 的 `focused / verbose / broken / timeout` 脚本赛道应成为首要入口。它们展示真实的 worktree、verify、diff、盲评和揭晓流程，而且不需要 API key。一个能在录屏里跑完的闭环，比一页功能列表更容易让人留下来。

参考入口：

- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin)
- [oh-my-dsh](https://github.com/amplifthq/oh-my-dsh)
- [grix](https://github.com/askie/grix)
- [dsh-conversation-exporter](https://github.com/liuyuelintop/dsh-conversation-exporter)

## 已经在项目内完成的增长基础设施

- 首屏不再是空白列表，而是一个能解释盲评机制的 Arena hero。
- 主视觉采用原创本地素材，构建时内嵌，不依赖 CDN。
- 列表页明确区分“最近的比赛”“匿名直到揭晓”和“零成本 demo”路径。
- README 保留中英文安装路径，并把公平性、匿名契约、本地性和 demo 放在核心位置。
- 推广草稿改为可验证口径，不再使用无法证实的星数或生态地位表述。

## 发布前 7 天执行表

### Day 0：把仓库变成可分享的产品

- 补一段 30–45 秒 GIF：创建 demo → race → review → reveal。
- 截一张首屏图和一张 reveal 图，优先展示“先选 A/B，再显示模型名”的瞬间。
- 运行 `npm test && npm run build && npm pack --dry-run`，把版本号、安装命令和产物名称对齐。
- 给 GitHub 仓库添加：`dsh-plugin`、`deepseek-harness`、`agent-evaluation`、`blind-review`、`llm-evaluation` 主题。

### Day 1–2：让别人能找到并安装

- 提交到 `awesome-dsh-plugin`；满足其仓库年龄、提交数、`dsh.bundle` 和 topic 要求后再提 PR。
- 同步准备一条 `dsh-market` / `dsh-find-plugin` 可识别的安装信息。
- GitHub Release 附带 tarball、校验值、demo 录屏和一页“数据如何保持匿名”的说明。

### Day 3–4：围绕一个反直觉瞬间发帖

标题建议：

> 我让 Agent 互相比赛，但先把模型名字藏起来：DSH Blind Arena

正文只讲一个故事：同一任务、同一 commit、2–4 条隔离 worktree；先看行为和验证结果投票，再点 reveal。最后给出一条零成本安装/演示命令。评论区再补架构与隐私细节。

### Day 5–7：把反馈变成版本，而不是只收集 star

- Issue 模板分成 `first-run`、`fairness`、`provider`、`export` 四类。
- 每个反馈都追问“用户在哪一步没完成闭环”。
- 首个小版本优先修安装、demo、导出和可读性；新功能放到后面。
- 发布后一周写一篇短复盘：完成了几场 demo、多少人成功 reveal、最常见失败点是什么。

## 可直接使用的短文案

```text
DSH Blind Arena：先看 Agent 做得怎么样，再知道它是谁。

同一任务，同一 commit，隔离 worktree，共享 verify。
2–4 个模型匿名竞速；你先盲评测试、diff、回答和成本，最后再 reveal。

内置零成本 demo，不需要 API key：
npm install dsh-blind-arena

不是排行榜，也不是“把名字藏在 CSS 后面”。匿名是协议的一部分。
```

## 不应该做的事

- 不承诺“必然公平”“一定更强”或保证 star 数。
- 不把普通多模型并行执行包装成新范式；差异必须落在“身份在评判后才出现”的结构上。
- 不在用户未授权时自动发布、群发或推送；本文件只准备仓库、素材和文案。
