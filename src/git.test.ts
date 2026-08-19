import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  captureDiff,
  createBranch,
  createWorktree,
  currentBranch,
  headCommit,
  isGitRepo,
  preflight,
  removeWorktree,
  repoRoot,
  statusPorcelain,
  tail,
} from './git.ts'

const exec = promisify(execFile)

async function git(repo: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repo, ...args], { maxBuffer: 8 * 1024 * 1024 })
  return stdout.trim()
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-arena-git-'))
  await exec('git', ['-C', dir, 'init', '-b', 'main', '-q'])
  await exec('git', ['-C', dir, 'config', 'user.email', 'test@example.com'])
  await exec('git', ['-C', dir, 'config', 'user.name', 'Test'])
  await writeFile(join(dir, 'a.txt'), 'one\n')
  await git(dir, 'add', 'a.txt')
  await git(dir, 'commit', '-qm', 'initial')
  return dir
}

describe('git helpers', () => {
  it('tail truncates and keeps short text', () => {
    expect(tail('short')).toBe('short')
    const long = 'x'.repeat(10_000)
    const out = tail(long)
    // tail() keeps the last MAX chars plus a leading ellipsis → MAX + 1
    expect(out).toHaveLength(4_001)
    expect(out.startsWith('…')).toBe(true)
    expect(out.slice(1)).toHaveLength(4_000)
  })

  it('isGitRepo / repoRoot / currentBranch / headCommit work on a real repo', async () => {
    const repo = await initRepo()
    try {
      expect(await isGitRepo(repo)).toBe(true)
      expect(await isGitRepo('/tmp')).toBe(false)
      expect(await repoRoot(repo)).toBe(await realpath(repo))
      expect(await currentBranch(repo)).toBe('main')
      expect(await headCommit(repo)).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('preflight reports a clean repo with its head and branch', async () => {
    const repo = await initRepo()
    try {
      const res = await preflight(repo)
      expect(res.ok).toBe(true)
      expect(res.clean).toBe(true)
      expect(res.branch).toBe('main')
      expect(res.head).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('preflight flags a dirty working tree', async () => {
    const repo = await initRepo()
    try {
      await writeFile(join(repo, 'a.txt'), 'modified\n')
      const res = await preflight(repo)
      expect(res.ok).toBe(true)
      expect(res.clean).toBe(false)
      expect(res.dirtyEntries?.length ?? 0).toBeGreaterThan(0)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('preflight rejects a non-repo path', async () => {
    const res = await preflight('/tmp')
    expect(res.ok).toBe(false)
  })

  it('captureDiff reports additions/deletions and a patch', async () => {
    const repo = await initRepo()
    const baseline = (await git(repo, 'rev-parse', 'HEAD'))!
    try {
      await writeFile(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
      const diff = await captureDiff(repo, baseline)
      expect(diff.files.length).toBe(1)
      expect(diff.files[0]!.path).toBe('a.txt')
      expect(diff.additions).toBe(2) // added "two" and "three"
      expect(diff.deletions).toBe(0)
      expect(diff.patch).toContain('+two')
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('createWorktree pins a detached worktree at the given commit and createBranch works', async () => {
    const repo = await initRepo()
    const home = await mkdtemp(join(tmpdir(), 'dsh-arena-home-'))
    try {
      const worktree = join(home, 'wt')
      await createWorktree(repo, (await git(repo, 'rev-parse', 'HEAD'))!, worktree)
      expect(await headCommit(worktree)).toBe(await headCommit(repo))

      const { branch, commit } = await createBranch(worktree, 'arena/demo/winner')
      expect(branch).toBe('arena/demo/winner')
      expect(commit).toMatch(/^[0-9a-f]{40}$/)

      // cleanup the worktree properly
      await removeWorktree(worktree, home)
    } finally {
      await rm(repo, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('removeWorktree refuses a path outside the arena home', async () => {
    const repo = await initRepo()
    try {
      await expect(removeWorktree('/tmp/unrelated', '/home/someone/.dsh/arena/x')).rejects.toThrow(
        /refusing to remove worktree outside arena home/,
      )
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('statusPorcelain returns the dirty entry lines', async () => {
    const repo = await initRepo()
    try {
      await writeFile(join(repo, 'b.txt'), 'new file\n')
      const entries = await statusPorcelain(repo)
      expect(entries.some((e) => e.includes('b.txt'))).toBe(true)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
