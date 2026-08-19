import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ArenaExperiment } from './types.ts'
import { buildHtml, createWinnerBranch, exportReport } from './export.ts'

// createWinnerBranch delegates to git.createBranch; stub it so the success
// path is testable without a real worktree.
vi.mock('./git.ts', () => ({
  createBranch: async () => ({ branch: 'arena/exp/A', commit: 'cafebabe' }),
}))

function makeExp(overrides: Partial<ArenaExperiment> = {}): ArenaExperiment {
  return {
    id: 'ar-20260819-1200-zzzz',
    createdAt: 1_728_000_000_000,
    demo: false,
    repoPath: '/repo',
    repoBranch: 'main',
    baselineCommit: 'deadbeef'.repeat(5),
    baselineClean: true,
    task: 'fix <median> & "quotes"',
    verifyCommands: ['npm test'],
    timeoutMs: 600_000,
    phase: 'running',
    lanes: [
      {
        label: 'A',
        status: 'done',
        worktreePath: '/wt/A',
        feed: [],
        passed: true,
        finalAnswer: 'fixed it',
        durationMs: 1_500,
        changedFilesCount: 1,
        additions: 2,
        deletions: 1,
        tokens: { source: 'provider', input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
        identity: { provider: 'openai', model: 'gpt-5', label: 'openai / gpt-5' },
      },
      {
        label: 'B',
        status: 'failed',
        worktreePath: '/wt/B',
        feed: [],
        passed: false,
        error: 'boom',
      },
    ],
    deviations: ['A: worktree 创建失败 — disk full'],
    comparability: 'degraded',
    ...overrides,
  }
}

describe('buildHtml', () => {
  it('escapes untrusted task, answer, and identity text', () => {
    const html = buildHtml(makeExp(), false, [])
    expect(html).toContain('fix &lt;median&gt; &amp; &quot;quotes&quot;')
    expect(html).toContain('openai / gpt-5')
    expect(html).toContain('<title>DSH Arena — ar-20260819-1200-zzzz</title>')
  })

  it('renders a revealed identity when present and masks it otherwise', () => {
    const html = buildHtml(makeExp(), false, [])
    // lane A has identity → rendered, not masked
    expect(html).toContain('openai / gpt-5')
    // lane B has no identity → masked placeholder
    expect(html).toContain('<div class="identity masked">未揭晓</div>')
  })

  it('renders pass/fail badges and winner mark', () => {
    const html = buildHtml(makeExp({ verdict: { winner: 'A', kind: 'winner', savedAt: 1_728_000_000_000 } }), false, [])
    expect(html).toContain('✓ 测试通过')
    expect(html).toContain('✗ 测试未通过')
    expect(html).toContain('★ 盲选冠军')
  })

  it('includes diff sections only when includeDiff and a patch exists', () => {
    const exp = makeExp()
    const diffs = [
      { label: 'A', patch: '--- a/old\n+++ b/new\n' },
      { label: 'B', patch: '' },
    ]
    const withDiff = buildHtml(exp, true, diffs)
    expect(withDiff).toContain('<details class="diff">')
    expect(withDiff).toContain('+++ b/new')

    const withoutDiff = buildHtml(exp, false, diffs)
    expect(withoutDiff).not.toContain('<details class="diff">')
  })

  it('renders deviations and degraded comparability note', () => {
    const html = buildHtml(makeExp(), false, [])
    expect(html).toContain('偏差记录')
    expect(html).toContain('disk full')
    expect(html).toContain('实验可比性: 降级')
  })

  it('produces a self-contained offline HTML document', () => {
    const html = buildHtml(makeExp(), false, [])
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('</html>')
    // no external network resources
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).toContain('本报告离线自包含')
  })

  it('shows identity-revealed footer note in revealed phase', () => {
    const html = buildHtml(makeExp({ phase: 'revealed', revealedAt: 1_728_000_100_000 }), false, [])
    expect(html).toContain('身份已揭晓')
  })
})

describe('exportReport', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-arena-export-'))
    process.env.DSH_ARENA_HOME = home
  })

  afterEach(async () => {
    delete process.env.DSH_ARENA_HOME
    await rm(home, { recursive: true, force: true })
  })

  it('writes report.html and report.json and reports bytes', async () => {
    const exp = makeExp()
    const res = await exportReport(exp, true, [{ label: 'A', patch: 'patch-a' }])
    expect(res.path).toMatch(/report\.html$/)
    expect(res.bytes).toBeGreaterThan(100)

    const jsonPath = join(home, exp.id, 'exports', 'report.json')
    const htmlPath = join(home, exp.id, 'exports', 'report.html')
    const json = JSON.parse(await readFile(jsonPath, 'utf8'))
    expect(json.id).toBe(exp.id)
    expect(Buffer.byteLength(await readFile(htmlPath, 'utf8'))).toBe(res.bytes)
  })
})

describe('createWinnerBranch', () => {
  it('refuses a nonexistent lane', async () => {
    const res = await createWinnerBranch(makeExp(), 'Z')
    expect(res).toEqual({ ok: false, message: '赛道 Z 不存在' })
  })

  it('refuses demo experiments (no branch promotion for fake races)', async () => {
    const res = await createWinnerBranch(makeExp({ demo: true }), 'A')
    expect(res).toEqual({ ok: false, message: '演示比赛不创建分支' })
  })

  it('delegates real-lane branch creation to git and returns the result', async () => {
    const res = await createWinnerBranch(makeExp(), 'A')
    expect(res).toEqual({ ok: true, value: { branch: 'arena/exp/A', commit: 'cafebabe' } })
  })
})
