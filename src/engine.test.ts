import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreflightResult } from './types.ts'
import { ArenaEngine, formatIdentity } from './engine.ts'
import type { ExperimentStore } from './store.ts'

let preflightResult: PreflightResult = {
  ok: true,
  repoPath: '/repo',
  head: 'deadbeef'.repeat(5),
  branch: 'main',
  clean: true,
  dirtyEntries: [],
  suggestedCommands: [],
}

vi.mock('./git.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./git.ts')>()
  return {
    ...actual,
    preflight: async (): Promise<PreflightResult> => preflightResult,
    createWorktree: async () => undefined,
    captureDiff: async () => ({ patch: '', files: [], additions: 0, deletions: 0 }),
    removeWorktree: async () => undefined,
    pruneWorktrees: async () => undefined,
  }
})

// create() fires runExperiment fire-and-forget; that path must never touch a
// real agent or demo, so both lane drivers are stubbed out. runner.ts pulls in
// dsh-agent at import time (runtime dep not installed for tests), so mock it
// self-contained rather than via importOriginal.
vi.mock('./runner.ts', () => ({
  runLane: async () => ({ ok: true, status: 'done', finalAnswer: 'ok', feed: [], tokens: { source: 'unknown', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, sessionId: 's' }),
}))

vi.mock('./demo.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demo.ts')>()
  return {
    ...actual,
    runDemoLane: async () => undefined,
  }
})

function stubStore(): ExperimentStore {
  return {
    save: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    listIds: vi.fn(async () => []),
    readDiff: vi.fn(async () => ''),
  }
}

// runExperiment writes under the arena home; isolate it to a throwaway dir.
let arenaHome: string

const ctx = { get: () => undefined } as unknown as Context

function makeEngine(): ArenaEngine {
  return new ArenaEngine(ctx, stubStore())
}

const twoParticipants = [
  { provider: 'openai', model: 'gpt-5' },
  { provider: 'anthropic', model: 'claude' },
]

describe('formatIdentity', () => {
  it('formats provider / model', () => {
    expect(formatIdentity({ provider: 'openai', model: 'gpt-5' })).toBe('openai / gpt-5')
  })

  it('appends reasoning effort when present', () => {
    expect(formatIdentity({ provider: 'anthropic', model: 'claude', reasoningEffort: 'high' })).toBe(
      'anthropic / claude (high)',
    )
  })

  it('omits the effort suffix when absent', () => {
    expect(formatIdentity({ provider: 'openai', model: 'gpt-4o' })).toBe('openai / gpt-4o')
  })
})

describe('ArenaEngine.create validation', () => {
  beforeEach(async () => {
    arenaHome = await mkdtemp(join(tmpdir(), 'dsh-arena-engine-'))
    process.env.DSH_ARENA_HOME = arenaHome
    preflightResult = {
      ok: true,
      repoPath: '/repo',
      head: 'deadbeef'.repeat(5),
      branch: 'main',
      clean: true,
      dirtyEntries: [],
      suggestedCommands: [],
    }
  })

  afterEach(async () => {
    delete process.env.DSH_ARENA_HOME
    await rm(arenaHome, { recursive: true, force: true })
  })

  const baseInput = {
    repoPath: '/repo',
    task: '  fix median()  ',
    verifyCommands: ['npm test', '  ', 'npm run build'],
    timeoutMinutes: 10,
    participants: twoParticipants,
  }

  it('rejects fewer than 2 participants', async () => {
    const res = await makeEngine().create({ ...baseInput, participants: [{ provider: 'a', model: 'b' }] })
    expect(res).toEqual({ ok: false, message: '参赛者数量必须是 2~4' })
  })

  it('rejects more than 4 participants', async () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((m) => ({ provider: 'p', model: m }))
    const res = await makeEngine().create({ ...baseInput, participants: many })
    expect(res).toEqual({ ok: false, message: '参赛者数量必须是 2~4' })
  })

  it('rejects an empty task after trimming', async () => {
    const res = await makeEngine().create({ ...baseInput, task: '   ' })
    expect(res).toEqual({ ok: false, message: '任务描述不能为空' })
  })

  it('rejects empty verify commands after trimming', async () => {
    const res = await makeEngine().create({ ...baseInput, verifyCommands: ['  ', ''] })
    expect(res).toEqual({ ok: false, message: '至少需要一条验证命令' })
  })

  it('rejects a dirty working tree (anonymity baseline safety)', async () => {
    preflightResult = { ...preflightResult, clean: false, dirtyEntries: [' M a.txt'] }
    const res = await makeEngine().create(baseInput)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain('工作区不干净')
  })

  it('rejects a non-git repo via preflight failure', async () => {
    preflightResult = { ok: false, message: '不是 Git 仓库(无法固定共同基线)', suggestedCommands: [] }
    const res = await makeEngine().create(baseInput)
    expect(res).toEqual({ ok: false, message: '不是 Git 仓库(无法固定共同基线)' })
  })

  it('trims task, filters blank verify commands, keeps identities server-side', async () => {
    const res = await makeEngine().create(baseInput)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.task).toBe('fix median()')
      expect(res.value.verifyCommands).toEqual(['npm test', 'npm run build'])
      // anonymity contract: the public record carries no identity
      for (const lane of res.value.lanes) {
        expect(lane).not.toHaveProperty('identity')
        expect(lane).not.toHaveProperty('agentSessionId')
      }
      expect(res.value.lanes.map((l) => l.label)).toEqual(['A', 'B'])
      expect(res.value.demo).toBe(false)
      expect(res.value.baselineClean).toBe(true)
      expect(res.value.timeoutMs).toBe(10 * 60_000)
    }
  })

  it('sets demo=true for a demo race', async () => {
    const res = await makeEngine().create({ ...baseInput, demo: true, participants: twoParticipants })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.demo).toBe(true)
      expect(res.value.lanes).toHaveLength(2)
    }
  })

  it('clamps timeoutMinutes into [1, 60]', async () => {
    const high = await makeEngine().create({ ...baseInput, timeoutMinutes: 999 })
    expect(high.ok).toBe(true)
    if (high.ok) expect(high.value.timeoutMs).toBe(60 * 60_000)
    const low = await makeEngine().create({ ...baseInput, timeoutMinutes: 0 })
    expect(low.ok).toBe(true)
    if (low.ok) expect(low.value.timeoutMs).toBe(60_000)
  })
})
