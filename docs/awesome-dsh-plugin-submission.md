# DSH Blind Arena — awesome-dsh-plugin submission (ready to file)

Submit via PR to https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
once the repo clears the CI bar (created ≥1 day, ≥10 commits; checked
automatically). Do NOT edit their READMEs by hand — they are generated.

## File to add: `data/plugins/changer-changer__dsh-blind-arena.yml`

```yaml
url: https://github.com/changer-changer/dsh-blind-arena
name: changer-changer/dsh-blind-arena
category: workflow
description:
  en: 'Blind, fair, local agent arena in DSH Web: same task, same commit, isolated worktrees, 2–4 model lanes, shared verification, judge before you reveal; zero-cost demo mode.'
  zh: 'DSH Web 里的盲测、公平、全本地 Agent 竞技场：同一任务、同一 commit、隔离 worktree、2–4 赛道并行、共享验证、先评判再揭晓；含零成本演示模式。'
```

- **category**: `workflow` — matches the "Workflow & Automation" bucket and the
  sibling engineering-workflow preset (evaluation-of-work is a workflow).
- **manifest check**: `package.json` declares `dsh.bundle.patch` ✅ and
  `cordis.patch.yml` sits at repo root ✅ — both required by their CI.
- **topic check**: repo already carries the `dsh-plugin` topic ✅ (their
  contributing guide requires it).
- **description is factual**: nothing overstated; claims match the code
  (same-commit worktrees, 2–4 lanes, shared verify, blind reveal, demo mode).

## After the YAML is merged (automatic downstream)

- The `awesome-dsh-plugin.com` site picks it up.
- **dsh-market** (⭐1K) reads this same registry — the plugin appears there
  automatically, usually within a day. One PR = two listings.

## Timing

Repo created 2026-08-19T00:45:55Z. Earliest acceptable PR: 2026-08-20T00:46Z
(repo ≥1 day). Needs ≥10 commits on `main` — currently 5; add real work
(tests, docs, fixes) to reach it naturally. Do not fabricate commits.
