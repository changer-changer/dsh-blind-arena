import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ArenaExperiment, ArenaSecrets } from './types.ts'
import { fileStore, redactExperiment, revealedExperiment } from './store.ts'

let HOME = '/tmp/dsh-arena-store-test'

function makeExp(overrides: Partial<ArenaExperiment> = {}): ArenaExperiment {
  return {
    id: 'ar-20260819-0000-abcd',
    createdAt: 1_728_000_000_000,
    demo: false,
    task: 'fix median()',
    repoPath: '/repo',
    repoBranch: 'main',
    baselineCommit: 'deadbeef',
    baselineClean: true,
    verifyCommands: ['npm test'],
    timeoutMs: 10 * 60_000,
    phase: 'running',
    deviations: [],
    comparability: 'ok',
    lanes: [
      {
        label: 'A',
        status: 'done',
        worktreePath: '/repo-wt/A',
        feed: [],
        identity: { provider: 'openai', model: 'gpt-5', label: 'openai / gpt-5' },
        agentSessionId: 'session-a',
      },
      {
        label: 'B',
        status: 'done',
        worktreePath: '/repo-wt/B',
        feed: [],
        identity: { provider: 'anthropic', model: 'claude', label: 'anthropic / claude' },
        agentSessionId: 'session-b',
      },
    ],
    ...overrides,
  }
}

const secrets: ArenaSecrets = {
  identities: {
    A: { provider: 'openai', model: 'gpt-5', label: 'openai / gpt-5' },
    B: { provider: 'anthropic', model: 'claude', label: 'anthropic / claude' },
    C: { provider: 'openai', model: 'gpt-4o', label: 'openai / gpt-4o' },
    D: { provider: 'anthropic', model: 'sonnet', label: 'anthropic / sonnet' },
  },
  agentSessions: { A: 'session-a', B: 'session-b', C: 'session-c', D: 'session-d' },
}

describe('redactExperiment (anonymity contract)', () => {
  it('strips identity and agentSessionId from every lane', () => {
    const out = redactExperiment(makeExp())
    for (const lane of out.lanes) {
      expect(lane).not.toHaveProperty('identity')
      expect(lane).not.toHaveProperty('agentSessionId')
    }
  })

  it('preserves all non-secret lane fields', () => {
    const out = redactExperiment(makeExp())
    expect(out.lanes[0]!.label).toBe('A')
    expect(out.lanes[0]!.status).toBe('done')
    expect(out.lanes[0]!.worktreePath).toBe('/repo-wt/A')
  })

  it('preserves experiment-level fields', () => {
    const out = redactExperiment(makeExp())
    expect(out.id).toBe('ar-20260819-0000-abcd')
    expect(out.task).toBe('fix median()')
    expect(out.baselineCommit).toBe('deadbeef')
  })

  it('does not mutate the input experiment', () => {
    const exp = makeExp()
    redactExperiment(exp)
    expect(exp.lanes[0]).toHaveProperty('identity')
  })

  it('is idempotent', () => {
    const once = redactExperiment(makeExp())
    const twice = redactExperiment(once)
    expect(twice).toEqual(once)
  })
})

describe('revealedExperiment', () => {
  it('merges identities and agent session ids into lanes', () => {
    const out = revealedExperiment(makeExp(), secrets)
    expect(out.lanes[0]!.identity).toEqual({ provider: 'openai', model: 'gpt-5', label: 'openai / gpt-5' })
    expect(out.lanes[0]!.agentSessionId).toBe('session-a')
    expect(out.lanes[1]!.identity).toEqual({ provider: 'anthropic', model: 'claude', label: 'anthropic / claude' })
  })

  it('returns the experiment unchanged when secrets are absent', () => {
    const exp = makeExp()
    expect(revealedExperiment(exp, undefined)).toBe(exp)
  })
})

describe('fileStore', () => {
  let store: ReturnType<typeof fileStore>

  beforeEach(async () => {
    HOME = await mkdtemp(join(tmpdir(), 'dsh-arena-store-'))
    process.env.DSH_ARENA_HOME = HOME
    store = fileStore()
  })

  afterEach(async () => {
    delete process.env.DSH_ARENA_HOME
    await rm(HOME, { recursive: true, force: true })
  })

  it('persists and loads an experiment with secrets', async () => {
    const exp = makeExp()
    await store.save(exp, secrets)
    const loaded = await store.load(exp.id)
    expect(loaded?.exp.id).toBe(exp.id)
    expect(loaded?.secrets?.identities.A.label).toBe('openai / gpt-5')
  })

  it('returns undefined for a nonexistent experiment', async () => {
    expect(await store.load('ar-does-not-exist')).toBeUndefined()
  })

  it('returns undefined for an unsafe id (path traversal guard)', async () => {
    expect(await store.load('../etc/passwd')).toBeUndefined()
  })

  it('lists experiments newest-first and ignores non-ar- entries', async () => {
    const old = makeExp({ id: 'ar-20260101-0000-old', createdAt: 100 })
    const fresh = makeExp({ id: 'ar-20260819-0000-fresh', createdAt: 999 })
    await store.save(old)
    await store.save(fresh)
    const list = await store.list()
    expect(list.map((s) => s.id)).toEqual(['ar-20260819-0000-fresh', 'ar-20260101-0000-old'])
    expect(list[0]!.laneCount).toBe(2)
  })

  it('round-trips a diff file', async () => {
    const exp = makeExp()
    await store.save(exp)
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await mkdir(join(HOME, exp.id, 'diffs'), { recursive: true })
    await writeFile(join(HOME, exp.id, 'diffs', 'A.patch'), '--- a\n+++ b\n', 'utf8')
    expect(await store.readDiff(exp.id, 'A')).toBe('--- a\n+++ b\n')
    expect(await store.readDiff(exp.id, 'B')).toBe('')
  })

  it('redact + reveal round-trip keeps the anonymity invariant', async () => {
    const exp = makeExp()
    const publicView = redactExperiment(exp)
    expect(publicView.lanes[0]).not.toHaveProperty('identity')
    const revealed = revealedExperiment(publicView, secrets)
    expect(revealed.lanes[0]!.identity).toEqual({ provider: 'openai', model: 'gpt-5', label: 'openai / gpt-5' })
  })
})
