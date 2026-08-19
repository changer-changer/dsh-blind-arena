# DSH Arena

**Blind, fair, local Agent arena inside DSH Web.**

Same task. Same commit. Isolated worktrees. Shared verification. **Judge before you reveal.**

![DSH Blind Arena: blind evaluation before reveal](assets/arena-hero.png)

> In one sentence: judge an agent's work before you learn which model produced it.

DSH Arena turns your DeepSeek Harness (DSH) Web into a model-vs-model fight club: pick a task, pick 2–4 contestants (any provider/model DSH supports), and let them race on the exact same repository state. Lane identities are kept secret until you decide — no label bias, no prompt leaks, no cherry-picked baselines.

## Why this exists

Benchmarks lie. Leaderboards are curated. When you evaluate an agent, the simple act of *knowing which model you're looking at* biases everything downstream: your prompts, your patience, your verdict.

DSH Arena removes that bias structurally:

- **One repository state** — every lane starts from the same commit, in its own git worktree. No drift, no stale forks.
- **Random lane assignment** — participants are shuffled onto lanes A/B/C/D at creation. The host knows; the wire doesn't.
- **Identity-free protocol** — the public experiment record contains *no* participant identity. Identities live in a server-side `secrets.json` and merge into the view only after you call `reveal`.
- **Shared verification** — the same user-defined `verify` command runs against every lane, in the same environment.
- **Blind verdict** — pick the winner from behavior alone (tests, diff, final answer, token/time cost). Then reveal and see who actually won.

## Features

- 🏟 **2–4 lane races** with live progress feed (tool calls, turns, tokens) per lane
- 🔒 **Anonymity contract** enforced at the type level: the wire type `ArenaExperiment` has no identity field; `redactExperiment` strips everything before serve
- ✅ **Shared verification** — user-defined commands, per-lane exit code / timeout / duration, visible in the race view
- 🏁 **Blind verdict → reveal** flow with per-lane diffs and final answers
- 📤 **Offline export** — self-contained HTML report + raw JSON + per-lane unified patch, no network
- 🌿 **Winner branch** — promote the winning lane's worktree to `arena/<id>/<label>` (real lanes only)
- 🎬 **Zero-cost demo mode** — deterministic scripted lanes (focused / verbose / broken / timeout) that exercise the *entire* pipeline with no API key, no spend: worktree → change → verify → diff → review → reveal
- 🧹 **Cleanup** — prune stale worktrees and experiment state from the UI
- 🖥 **Full client UI** injected into DSH Web: create / list / live race / review / reveal

## Quick start

The release checklist, demo narrative, and DSH ecosystem launch plan live in [docs/ECOSYSTEM-GROWTH.md](docs/ECOSYSTEM-GROWTH.md).

1. Install the plugin into your DSH Web profile (Cordis bundle — see `cordis.patch.yml`):
   ```bash
   npm install dsh-blind-arena
   ```
2. Open DSH Web → the **Arena** plugin row appears.
3. Create an experiment: point at a local repo, write a task, add verify commands, pick contestants.
4. Watch the race live. Judge blind. Reveal. Export the report.

> No credentials? Run the **demo mode** first — it walks the full product loop with scripted lanes so you can evaluate the flow before spending a single token.

## Architecture

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

- `src/engine.ts` — orchestration: preflight → worktrees → lanes → verification → diff → persistence; implements the anonymity contract
- `src/runner.ts` — one lane's agent lifecycle on top of `@deepseek-ai/dsh-agent` (session, model selection, consumed-work folding)
- `src/verify.ts` — shared verification runner
- `src/git.ts` — worktree / diff / branch primitives
- `src/store.ts` — durable store under `~/.dsh/arena/<id>/`: public `experiment.json` + server-only `secrets.json`
- `src/export.ts` — offline HTML report + JSON + winner branch
- `src/demo.ts` — deterministic demo lanes (no API cost)
- `src/client/` — React UI injected into DSH Web

**Storage:** `~/.dsh/arena/`. Everything is local; nothing leaves your machine except your own browser.

## Requirements

- Node `^22.19.0 || >=24.0.0`
- DSH (DeepSeek Harness) with Web client runtime
- `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-session` (`0.1.0-rc.7`)

## License

MIT
