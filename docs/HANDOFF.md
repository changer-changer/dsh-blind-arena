# DSH Blind Arena — Handoff for the Next Agent

> 交接给接手此项目的 agent。先读本文件，再读 `docs/DESIGN.md`（完整架构/ADR）。
> 代码库已用 codebase-memory-mcp 索引（项目名 `home-cuizhixing-Projects-dsh-arena`，
> 307 节点 / 816 边）——优先 `search_graph` / `trace_path` / `get_code_snippet`。

## 项目一句话

DSH Web 的盲测 Agent 竞技场插件：同任务、同 commit、隔离 worktree、2–4 赛道并行、
共享验证、先盲评后揭晓。仓库 `changer-changer/dsh-blind-arena`（GitHub-only，暂不发 npm）。

## 已验证的当前状态（2026-08-19）

| 项 | 状态 |
|---|---|
| 功能 | 完整：engine/runner/verify/git/store/export/demo + React 客户端 5 视图 |
| typecheck | ✅ 0 错误 |
| 测试 | ✅ 65 个全过（util/html/git/verify/store/engine/export/demo） |
| CI | ✅ GitHub Actions 全绿（node 22/24） |
| commits | 10 个（已达 awesome 收录门槛 ≥10） |
| 仓库年龄 | 创建于 2026-08-19T00:45:55Z —— **未满 1 天，是唯一剩余门槛** |
| GitHub | 8 topics（含 `dsh-plugin`）、`dsh.bundle` manifest ✅、`cordis.patch.yml` ✅ |
| 文档 | `docs/DESIGN.md`、ADR×9、`docs/awesome-dsh-plugin-submission.md`、`docs/promotion-draft.md` |

## 下一步：awesome-dsh-plugin 收录 PR（时间门槛）

**何时**：2026-08-20T00:46Z（UTC）之后 = 北京时间 8:46。在此前提交会被上游 CI
按"仓库不满 1 天"自动拒绝（贡献指南明说重提无碍，但没必要主动触发）。

**怎么做**（fork 分支已就绪，一次命令）：
```bash
# fork 已存在：changer-changer/awesome-dsh-plugin
# 分支 add/dsh-blind-arena 已推送，含 data/plugins/changer-changer__dsh-blind-arena.yml

cd /tmp/awesome-dsh-plugin && git checkout add/dsh-blind-arena && git pull origin add/dsh-blind-arena
gh pr create \
  --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --head changer-changer:add/dsh-blind-arena \
  --title "Add dsh-blind-arena — blind agent arena plugin for DSH Web" \
  --body "Same task, same commit, isolated worktrees, shared verification, judge before you reveal. Declares dsh.bundle manifest + cordis.patch.yml; dsh-plugin topic set. Category: workflow."
```

**PR 内容核对**（已对照官方样例 `82c86b8z86-stack__dsh-engineering-workflow.yml`）：
- `url` 精确匹配仓库 ✅；`name` = owner/repo ✅；`category: workflow` ✅
- 描述仅陈述可验证事实（无营销词、无星数夸大）✅
- 按贡献指南：README 由脚本生成勿手改；yml 单文件 PR ✅
- 合并后自动进 `awesome-dsh-plugin.com` + **dsh-market（⭐1K）**，一次 PR 双收录

**注意**：上游 `check-submission.mjs` 需 GITHUB_TOKEN 且枚举 commit 会跑很久（>120s），
不必本地跑完；格式已人工核对。上游 CI 会自己验证。

## 并行会话警告（重要）

有另一会话正在给项目做 **UI 增强**（hero art 生成、styles 重写、ListView 改造、
`scripts/embed-assets.mjs`、`assets/arena-hero.png`、build 接入 `generate:assets`）。
它引用的 `src/client/generated/art.ts` 当时尚未生成，typecheck 会因它短暂变红——
**那不是回归**，是对方中间态。接手时：
- 先 `git status` / `git diff` 看工作区是否有未提交的并行改动，**不要覆盖**
- 若 typecheck 报 `generated/art.ts` 缺失，等对方完成或自行跑 `npm run generate:assets`

## 社区推广（待用户授权）

`docs/promotion-draft.md` 已备好三版文案（中文主帖 / X 短帖 / HN 标题 + 评论区自答）。
**未发布**——发帖需用户指定渠道（掘金/V2EX/X/HN）并授权，外部操作不可擅自执行。

## 常用命令

```bash
npm run typecheck   # tsc --noEmit
npm run build       # generate:assets + typecheck + tsdown
npm test            # vitest run（65 tests）
git push            # 触发 CI（node 22/24）
```

## 遗留待办清单

- [ ] 明天 UTC 00:46 后：执行上面 `gh pr create`（fork 分支已就绪）
- [ ] PR 合并后：检查 awesome-dsh-plugin.com + dsh-market 是否出现
- [ ] 社区推广：等用户选渠道 → 发布 `docs/promotion-draft.md` 文案
- [ ] npm 发布：用户决定是否发布 `dsh-blind-arena`（package.json 元数据已备好）
