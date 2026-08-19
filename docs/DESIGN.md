# DSH Blind Arena — Design Document

> For AI agents taking over this project. Read this first; it condenses the
> architecture, the anonymity contract, module responsibilities, and the
> current state. The codebase is indexed with codebase-memory-mcp — prefer
> `search_graph` / `trace_path` / `get_code_snippet` over grep.

## 1. What this is

A **Cordis plugin for DeepSeek Harness (DSH)** that turns DSH Web into a
blind, fair, local agent arena: same task, same commit, isolated git
worktrees, 2–4 model lanes running in parallel, shared verification, judge
before you reveal.

Repo: `https://github.com/changer-changer/dsh-blind-arena`
Package: `dsh-blind-arena` (npm name reserved; not yet published — owner
decision, GitHub-only for now)

## 2. The core idea: anonymity contract

The entire product thesis is that **knowing which model you are looking at
biases evaluation**. The code enforces anonymity **structurally**, not by
convention:

1. **Random lane assignment** — participants are shuffled onto lanes
   A/B/C/D at creation (`randomLaneOrder` in `src/util.ts`). The host knows
   the mapping; the wire protocol never carries it.
2. **Identity-free wire type** — `ArenaExperiment` (in `src/types.ts`)
   contains **no participant identity field**. Identities live only in a
   server-side `secrets.json` file (`ArenaSecrets`).
3. **Redaction on serve** — `redactExperiment()` (`src/store.ts`) strips
   `identity` + `agentSessionId` from every lane before anything crosses the
   wire. `reveal()` is the only path that merges `secrets.json` back in.
4. **Blind verdict** — the judge picks a winner from behavior alone (tests,
   diff, final answer, token/time cost). Only after the verdict is saved does
   `reveal` show identities.

This is enforced at the type level: `ArenaExperiment` physically has no
identity property, so a future bug cannot accidentally leak it over the wire.

## 3. Architecture

```
DSH Web client (React, injected)          Host plugin (Cordis service `arena`)
┌───────────────────────────┐             ┌──────────────────────────────────────┐
│ CreateView / ListView     │  /api RPC   │ ArenaService (index.ts, Typert       │
│ RaceView / ReviewView    │◄───────────►│  remotes): preflight · create ·       │
│ RevealView                │  (redacted  │  cancel · verdict · reveal · diff ·  │
└───────────────────────────┘   until     │  export · createWinnerBranch ·       │
                               reveal)    │  cleanup · catalog · modelInfo       │
                                          │          │                           │
                                          │          ▼                           │
                                          │  ArenaEngine (engine.ts)             │
                                          │  preflight → worktrees → lanes →     │
                                          │  verify → diff → persist            │
                                          └──────────────────────────────────────┘
```

### Layers (from codebase-memory index)

- **entry**: `ArenaService` (index.ts) — Typert remote surface, only outbound calls
- **core**: `git` (high fan-in), `store` (20 in / 7 out), `util` (14 in), `types`
- **internal**: `engine` (4 in / 20 out — the orchestrator), `runner`, `demo`,
  `export`, `html`, `verify`, `client`
- **fixtures**: `demo-repo` — a tiny Node repo with a planted bug
  (`median()` returns NaN on empty input) used by demo mode

## 4. Module responsibilities

| Module | File | Responsibility |
|---|---|---|
| `types.ts` | domain vocabulary | All wire types, `ArenaExperiment` (identity-free), `ArenaSecrets` (host-only), `ArenaLane`, `ParticipantSpec`, `VerificationRun`, lane status machine |
| `index.ts` | ArenaService | 14 Typert remotes, RPC surface, wires store+engine+demo together |
| `engine.ts` | ArenaEngine | Orchestration: `runExperiment` (157 lines) drives preflight → worktrees → parallel lanes → verification → diff → persist; abort support via `AbortController`; `formatIdentity` |
| `runner.ts` | lane lifecycle | One lane = one DSH agent session on `@deepseek-ai/dsh-agent`; model selection (with `ReasoningEffortId` factory), `session/event` subscription, `foldConsumedWork` for turn-end reasons |
| `verify.ts` | shared verification | `runVerification(command, cwd, timeout)` — bash `-lc`, process-group SIGKILL on timeout, bounded output tail (4000 chars) |
| `git.ts` | git primitives | worktree create/remove (with arena-home safety check), preflight, `captureDiff` (name-status/numstat/binary), `createBranch`, `tail` |
| `store.ts` | persistence | `~/.dsh/arena/<id>/` — `experiment.json` (public) + `secrets.json` (host-only); `redactExperiment` / `revealedExperiment` |
| `export.ts` | reports | Self-contained offline HTML report + raw JSON + winner branch (`arena/<id>/<label>`, real lanes only) |
| `demo.ts` | demo mode | Deterministic scripted lanes (focused / verbose / broken / timeout) exercising the full pipeline with zero API cost |
| `html.ts` | escaping | `escapeHtml` for untrusted model output |
| `util.ts` | helpers | id/session id generation, Fisher–Yates shuffle, lane labels, paths under `~/.dsh/arena` |
| `client/` | React UI | `ArenaApp` (router + polling via `changesSince`), `rpc.ts` (ArenaClient), 5 views: Create/List/Race/Review/Reveal |

## 5. Core flows

### create (service → engine)

```
create(input: CreateExperimentInput)
  → preflight(repoPath)            # must be a clean git repo with HEAD
  → randomLaneOrder(participants)  # shuffle identities onto A/B/C/D
  → persist experiment.json        # identity-free
  → persist secrets.json           # host-only: identities + agent session ids
  → runExperiment(id, exp, secrets)  # fire the race
```

### runExperiment (the race)

1. `mkdir` worktrees dir; for each lane: `createWorktree(repo, baselineCommit, dest)` (detached)
2. For each lane, `runLane(...)` in parallel: agent session → `session/event`
   subscription → `foldConsumedWork` → terminal status derived from
   `turn/end` reason (`completed`→done, `error`→failed, `blocked`→blocked,
   timeout→timeout, aborted→cancelled)
3. If all lanes done/failed/etc: run `verify` command in each lane worktree
   (shared verification)
4. `captureDiff(worktree, baseline)` per lane
5. Persist updated `experiment.json` (still identity-free)

### review + reveal

```
verdict(id, winnerLabel)   # blind pick — UI shows lanes as A/B/C/D only
reveal(id)                 # merges secrets.json → lanes get identity
```

### demo mode

`demo.ts` scripts 4 lanes (focused/verbose/broken/timeout) that mutate the
fixture worktree deterministically and run real verification — full product
loop, no credentials, clearly labeled "演示" in UI.

## 6. Key design decisions (ADRs)

| # | Decision | Why |
|---|---|---|
| 1 | Identities never in wire type | Type-level enforcement of anonymity — impossible to leak accidentally |
| 2 | Worktrees, not branches | Lanes never touch the shared repo's branch state; `--detach` only |
| 3 | `secrets.json` separate from `experiment.json` | One file is public/exportable, the other host-only; report export can never leak identities |
| 4 | Shared verification command | Same env, same command, per-lane exit code/timeout/duration — apples-to-apples |
| 5 | `foldConsumedWork` from dsh-agent | Standard way to read turn-end reason; `data.reason` (not `reason`) on `SessionEvent<'turn/end'>` |
| 6 | bash `-lc` + process-group kill | Verification commands may spawn children; kill the whole group on timeout |
| 7 | Demo = real pipeline, scripted edits | Evaluators see the true loop (worktree→verify→diff→reveal) without spending tokens; no fake progress bars |
| 8 | Name `dsh-blind-arena` | `dsh-arena` was squatted on npm; "blind" is the differentiating feature |
| 9 | GitHub-only for now | Owner decision: no npm publish yet; awesome-dsh-plugin accepts GitHub-only plugins |

## 7. Current state (2026-08-19)

- ✅ **Build**: typecheck 0 errors; tsdown bundles host (ESM) + client (CJS)
- ✅ **Tests**: 27 tests (util/html unit + git/verify integration), all green
- ✅ **CI**: GitHub Actions on node 22/24 — typecheck, build, test
- ✅ **GitHub**: `changer-changer/dsh-blind-arena`, 4 commits, 8 topics incl. `dsh-plugin`
- ⏳ **awesome-dsh-plugin listing**: repo needs to be **≥1 day old and ≥10
  commits** (CI-checked). Current: 4 commits. Submit PR after threshold
  (tomorrow); one PR there lists you in dsh-market too (⭐1K)
- ⏳ **npm publish**: deferred (owner decision)
- ⏳ **Community promotion**: not started

## 8. Handover checklist / next work

1. **Commits**: real work accumulates commits naturally; next natural units —
   engine/runner/store unit tests, `npm audit` pass, maybe a `changesSince`
   test, README screenshots.
2. **awesome-dsh-plugin PR** (after repo age ≥1 day + ≥10 commits):
   - Add `data/plugins/changer-changer__dsh-blind-arena.yml` (category:
     `workflow` fits best; description must be factual, no marketing)
   - Format: `url`, `name`, `category`, `description: {en, zh}`
   - Regenerate READMEs with their script (`node scripts/generate-readme.mjs`)
   - Their CI checks manifest (`dsh.bundle` present ✅), repo age, commit count
3. **npm publish** (when owner opts in): `npm publish` — package.json already
   has repository/homepage/bugs metadata; `files` includes lib, cordis.patch.yml,
   fixtures, READMEs, LICENSE.
4. **Promotion**: Chinese intro post (掘金/V2EX/X), demo GIF/screencast,
   link back to GitHub.

## 9. Useful commands

```bash
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + tsdown (host ESM + client CJS)
npm test            # vitest run (27 tests)
git push            # CI runs typecheck+build+test on node 22/24
```

## 10. Codebase index

Indexed via codebase-memory-mcp as project
`home-cuizhixing-Projects-dsh-arena` (307 nodes / 816 edges). Use:
- `get_architecture` — clusters, layers, hotspots (top: `arenaClient`, `push`,
  `call`, `experimentDir`, `tryGit`, `load`)
- `trace_path(function_name="runExperiment", mode="calls")` — full orchestration chain
- `get_code_snippet(qualified_name="...src.store.redactExperiment")` — exact source
