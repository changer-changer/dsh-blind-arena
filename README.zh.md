# DSH Arena

**DSH Web 里的盲测、公平、全本地 Agent 竞技场。**

同一任务。同一 commit。隔离 worktree。共享验证。**先评判，再揭晓。**

![DSH Blind Arena：盲评先于揭晓](assets/arena-hero.png)

> 一句话：让你在不知道模型名字的情况下，先评判 Agent 的工作，再揭晓赢家。

DSH Arena 把你的 DeepSeek Harness (DSH) Web 变成一个模型对战擂台：选一个任务，挑 2–4 位参赛者（DSH 支持的任何 provider/model），让它们在完全相同的仓库状态下同场竞技。揭晓之前，所有赛道身份严格保密——没有标签偏见、没有提示词泄漏、没有挑选过的基线。

## 为什么做这个

基准测试会撒谎，排行榜都是精心编排的。评估 Agent 时，光是*知道你在看哪个模型*这件事，就会污染下游的一切：你的提示词、你的耐心、你的判断。

DSH Arena 从结构上消除这种偏见：

- **单一仓库状态** — 每条赛道从同一个 commit 出发，各有独立 git worktree。没有漂移，没有过期 fork。
- **随机赛道分配** — 创建时参赛者被随机洗牌到 A/B/C/D 赛道。宿主知道，协议不知道。
- **无身份协议** — 公开的实验记录里*不包含任何*参赛者身份。身份存在服务端 `secrets.json`，只有你调用 `reveal` 之后才合并进视图。
- **共享验证** — 你自定义的同一条 `verify` 命令在相同环境里对每条赛道运行。
- **盲评** — 只凭行为选赢家（测试、diff、最终回答、token/时间成本）。然后揭晓，看真正的赢家是谁。

## 功能

- 🏟 **2–4 赛道同场竞技**，实时进度流（工具调用、回合、token）
- 🔒 **类型层面强制匿名契约** — 线上类型 `ArenaExperiment` 根本没有身份字段；`redactExperiment` 在服务前剥掉一切
- ✅ **共享验证** — 用户自定义命令，每条赛道的退出码 / 超时 / 耗时，竞速视图实时可见
- 🏁 **盲评 → 揭晓** 完整流程，含每条赛道的 diff 与最终回答
- 📤 **离线导出** — 自包含 HTML 报告 + 原始 JSON + 每条赛道的 unified patch，全程无网络
- 🌿 **赢家分支** — 把胜者 worktree 提升为 `arena/<id>/<label>` 分支（仅真实赛道）
- 🎬 **零成本演示模式** — 确定性脚本赛道（focused / verbose / broken / timeout）跑通*完整*流水线：worktree → 改动 → 验证 → diff → 评审 → 揭晓。不需要 API key，不花一分钱
- 🧹 **清理** — 从 UI 一键清理过期 worktree 与实验状态
- 🖥 **完整客户端 UI** 注入 DSH Web：创建 / 列表 / 实时竞速 / 评审 / 揭晓

## 快速开始

完整的生态发布、demo 录屏和收录清单见 [docs/ECOSYSTEM-GROWTH.md](docs/ECOSYSTEM-GROWTH.md)。

1. 把插件装进你的 DSH Web profile（Cordis bundle，见 `cordis.patch.yml`）：
   ```bash
   npm install dsh-blind-arena
   ```
2. 打开 DSH Web → **Arena** 插件行出现。
3. 创建实验：指向本地仓库，写任务，加验证命令，挑参赛者。
4. 看竞速直播。盲评。揭晓。导出报告。

> 没有凭据？先跑**演示模式**——脚本赛道走完整个产品闭环，零成本评估流程，再决定要不要花 token。

## 架构

```
DSH Web client (React, injected)          Host plugin (Cordis service `arena`)
┌───────────────────────────┐             ┌──────────────────────────────────────┐
│ CreateView / ListView     │  /api RPC   │ ArenaService (Typert remotes)        │
│ RaceView / ReviewView    │◄───────────►│  preflight · create · cancel ·        │
│ RevealView                │  (redacted  │  verdict · reveal · diff · export ·  │
└───────────────────────────┘   until     │  createWinnerBranch · cleanup        │
                               reveal)    │          │                           │
                                          │          ▼                           │
                                          │  ArenaEngine                         │
                                          │  preflight → worktrees → lanes →     │
                                          │  verify → diff → persisted record   │
                                          └──────────────────────────────────────┘
```

- `src/engine.ts` — 编排：preflight → worktrees → lanes → 验证 → diff → 持久化；实现匿名契约
- `src/runner.ts` — 基于 `@deepseek-ai/dsh-agent` 的单赛道 Agent 生命周期（session、模型选择、consumed-work 折叠）
- `src/verify.ts` — 共享验证执行器
- `src/git.ts` — worktree / diff / 分支原语
- `src/store.ts` — `~/.dsh/arena/<id>/` 下的持久化存储：公开 `experiment.json` + 服务端独有 `secrets.json`
- `src/export.ts` — 离线 HTML 报告 + JSON + 赢家分支
- `src/demo.ts` — 确定性演示赛道（零 API 成本）
- `src/client/` — 注入 DSH Web 的 React UI

**存储：** `~/.dsh/arena/`。一切都在本地；除了你自己的浏览器，没有任何东西离开你的机器。

## 环境要求

- Node `^22.19.0 || >=24.0.0`
- DSH（DeepSeek Harness）及 Web client runtime
- `@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-session`（`0.1.0-rc.7`）

## License

MIT
