import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ArenaLane } from './types.ts'
import { runDemoLane } from './demo.ts'
import { createWorktree } from './git.ts'
import { worktreePath } from './util.ts'

const exec = promisify(execFile)
const FIXTURE = resolve('fixtures/demo-repo')

async function git(repo: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repo, ...args], { maxBuffer: 8 * 1024 * 1024 })
  return stdout.trim()
}

describe('runDemoLane (zero-cost demo pipeline)', () => {
  let home: string
  let repo: string
  let baseline: string
  const id = 'ar-20260819-0000-demo'
  const laneLabel = 'A'

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-arena-demo-'))
    process.env.DSH_ARENA_HOME = home

    // Seed a real git repo from the fixture, commit the baseline.
    repo = await mkdtemp(join(tmpdir(), 'dsh-arena-demo-repo-'))
    await exec('git', ['-C', repo, 'init', '-b', 'main', '-q'])
    await exec('git', ['-C', repo, 'config', 'user.email', 'demo@example.com'])
    await exec('git', ['-C', repo, 'config', 'user.name', 'Demo'])
    await mkdir(join(repo, 'src'), { recursive: true })
    await mkdir(join(repo, 'test'), { recursive: true })
    await copyFile(join(FIXTURE, 'package.json'), join(repo, 'package.json'))
    await copyFile(join(FIXTURE, 'src', 'stats.js'), join(repo, 'src', 'stats.js'))
    await copyFile(join(FIXTURE, 'test', 'stats.test.js'), join(repo, 'test', 'stats.test.js'))
    await git(repo, 'add', '.')
    await git(repo, 'commit', '-qm', 'baseline')
    baseline = await git(repo, 'rev-parse', 'HEAD')

    // Demo runs in a real isolated worktree at the arena-home path.
    const wt = worktreePath(id, laneLabel)
    await mkdir(join(home, id, 'worktrees'), { recursive: true })
    await createWorktree(repo, baseline, wt)
  })

  afterEach(async () => {
    delete process.env.DSH_ARENA_HOME
    await rm(home, { recursive: true, force: true })
    await rm(repo, { recursive: true, force: true })
  })

  it('walks the full pipeline: worktree → change → verify → diff → done', async () => {
    const patches: Partial<ArenaLane>[] = []
    const experiment = {
      id,
      createdAt: 1_728_000_000_000,
      demo: true,
      repoPath: repo,
      repoBranch: 'main',
      baselineCommit: baseline,
      baselineClean: true,
      task: 'fix median() on empty input',
      verifyCommands: ['npm test'],
      timeoutMs: 600_000,
      phase: 'running',
      lanes: [
        { label: 'A', status: 'preparing', worktreePath: worktreePath(id, 'A'), feed: [] },
        { label: 'B', status: 'preparing', worktreePath: worktreePath(id, 'B'), feed: [] },
      ],
      deviations: [],
      comparability: 'ok',
    } as const

    await runDemoLane({
      experiment,
      laneLabel,
      update: async (patch) => {
        patches.push(patch)
      },
    })

    const final = patches[patches.length - 1]!
    expect(final.status).toBe('done')
    expect(final.passed).toBe(true)
    expect(final.changedFilesCount).toBeGreaterThan(0)
    expect(final.additions).toBeGreaterThan(0)
    // the demo actually wrote the fixed stats.js into the real worktree
    const stats = await readFile(join(worktreePath(id, laneLabel), 'src', 'stats.js'), 'utf8')
    expect(stats).toContain('median of empty list')
    // a diff patch was captured and persisted (tracked-file changes only;
    // the untracked ARENA-DEMO.md is intentionally not part of git diff)
    const patch = await readFile(join(home, id, 'diffs', `${laneLabel}.patch`), 'utf8')
    expect(patch).toContain('src/stats.js')
  })

  it('marks a timeout lane as timeout and returns early', async () => {
    const patches: Partial<ArenaLane>[] = []
    const laneD = 'D'
    await mkdir(join(home, id, 'worktrees', 'D'), { recursive: true })
    await createWorktree(repo, baseline, worktreePath(id, laneD))
    const experiment = {
      id,
      createdAt: 1_728_000_000_000,
      demo: true,
      repoPath: repo,
      repoBranch: 'main',
      baselineCommit: baseline,
      baselineClean: true,
      task: 'x',
      verifyCommands: ['npm test'],
      timeoutMs: 600_000,
      phase: 'running',
      lanes: [
        { label: 'A', status: 'preparing', worktreePath: worktreePath(id, 'A'), feed: [] },
        { label: 'B', status: 'preparing', worktreePath: worktreePath(id, 'B'), feed: [] },
        { label: 'C', status: 'preparing', worktreePath: worktreePath(id, 'C'), feed: [] },
        { label: 'D', status: 'preparing', worktreePath: worktreePath(id, 'D'), feed: [] },
      ],
      deviations: [],
      comparability: 'ok',
    } as const

    await runDemoLane({
      experiment,
      laneLabel: laneD,
      update: async (p) => {
        patches.push(p)
      },
    })

    const final = patches[patches.length - 1]!
    expect(final.status).toBe('timeout')
    expect(final.error).toContain('演示')
  })
})
