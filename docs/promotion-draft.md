# DSH Blind Arena — 社区推广文案（就绪稿）

> 发布渠道候选：掘金、V2EX、X/Twitter、Hacker News。发布前请作者确认。
> 每个渠道一条主帖 + 评论区自答补充细节。

## 主帖（掘金 / V2EX 用）

# 我把 DeepSeek Harness 变成了一个「盲测」AI 竞技场

DSH（DeepSeek Harness，刚开源就 16 万星）的核心是「万物皆插件」。
我给它写了一个插件：**dsh-blind-arena** —— 让多个模型在同一条起跑线上打比赛，而你**不知道谁是谁**。

## 它解决什么问题

评测 Agent 最大的坑：**一旦你知道正在看哪个模型，评判就被污染了**。
你会无意识地对它更耐心、写更贴合的提示词、给它找补理由。

这个插件从结构上消除偏见，而不是靠自觉：

- **同一 commit、隔离 worktree** —— 每个模型从完全相同的仓库状态出发
- **随机分配赛道** —— 参赛者被随机洗到 A/B/C/D，宿主知道，协议不知道
- **协议层无身份** —— 线上数据根本不含参赛者信息，身份只存在服务端
  `secrets.json`，只有你主动 `reveal` 才合并回来
- **共享验证** —— 同一条 `verify` 命令在相同环境跑每个赛道
- **先评判，再揭晓** —— 只凭行为（测试、diff、回答、token/耗时）选赢家

## 功能一览

- 2–4 赛道同场竞技，实时进度流
- 盲评 → 揭晓 完整流程，含每条赛道的 diff 与最终回答
- 离线导出：自包含 HTML 报告 + JSON + 赢家分支
- **零成本演示模式**：脚本化赛道跑通完整流水线，不需要 API key
  （focused / verbose / broken / timeout 四种风格，全走真实管线）

## 为什么叫「盲测」

因为这是它唯一的差异化。市面上同类 arena 都只是「隔离跑多个模型」，
但**盲测**——让身份隐藏到评判之后——才是评测公平性的关键。
测试、排行都可以刷，唯独「你不知道在看谁」这层结构骗不了。

## 上手

```bash
npm install dsh-blind-arena   # 或从 GitHub 仓库安装
# 装进 DSH Web profile，打开 Web 就能看到 Arena 插件
```

没凭据？先跑演示模式，零成本体验完整闭环。

---

**GitHub**: https://github.com/changer-changer/dsh-blind-arena
（欢迎 star / 提 issue）

## X / Twitter 短帖

```
Turned DeepSeek Harness into a BLIND AI arena 🔀

Same task. Same commit. Isolated worktrees.
2–4 models race — you judge BEFORE you see who's who.

Because knowing the model = biased judging.
Structural anonymity: identities never touch the wire, merged only on reveal.

Zero-cost demo mode. Judge before reveal.
github.com/changer-changer/dsh-blind-arena
```

## HN 风格标题（若发）

- Show HN: A blind agent arena for DeepSeek Harness — judge models without knowing which is which
- DSH plugin that makes model evaluation actually fair: blind judging, structural anonymity

## 评论区自答要点

- **和普通 arena 什么区别？** 匿名契约是结构性的（类型层面就没有身份字段），
  不是 UI 上藏一下。竞品大多只是隔离跑 + 展示，身份从创建就暴露给 UI。
- **身份安全？** `redactExperiment` 在服务前剥离身份 + agent session id；
  导出报告只渲染公开记录，不可能泄漏。
- **demo 怎么做到零成本？** 脚本化改动 + 真实 verify，不是假进度条。
- **本地性？** 一切在 `~/.dsh/arena`，除了你自己的浏览器，数据不出机器。
