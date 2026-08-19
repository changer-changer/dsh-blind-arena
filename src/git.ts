import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { type ChangedFile, type PreflightResult } from './types.ts'

const exec = promisify(execFile)

const MAX_DIFF_BYTES = 8 * 1024 * 1024
const MAX_STDOUT_TAIL = 4_000
const MAX_DIRTY_ENTRIES = 200

function git(repo: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec('git', ['-C', repo, ...args], {
    maxBuffer: MAX_DIFF_BYTES,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
}

async function tryGit(repo: string, ...args: string[]): Promise<{ stdout: string; stderr: string } | undefined> {
  try {
    return await git(repo, ...args)
  } catch {
    return undefined
  }
}

export async function gitOk(repo: string, ...args: string[]): Promise<boolean> {
  return (await tryGit(repo, ...args)) !== undefined
}

export async function isGitRepo(path: string): Promise<boolean> {
  const out = await tryGit(path, 'rev-parse', '--is-inside-work-tree')
  return out?.stdout.trim() === 'true'
}

export async function repoRoot(path: string): Promise<string | undefined> {
  const out = await tryGit(path, 'rev-parse', '--show-toplevel')
  return out?.stdout.trim() || undefined
}

export async function headCommit(path: string): Promise<string | undefined> {
  const out = await tryGit(path, 'rev-parse', 'HEAD')
  return out?.stdout.trim() || undefined
}

export async function currentBranch(path: string): Promise<string | undefined> {
  const out = await tryGit(path, 'rev-parse', '--abbrev-ref', 'HEAD')
  return out?.stdout.trim() || undefined
}

export async function statusPorcelain(path: string): Promise<string[]> {
  const out = await tryGit(path, 'status', '--porcelain')
  if (!out) return []
  return out.stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '').slice(0, MAX_DIRTY_ENTRIES)
}

/** Preflight the user-selected repository: HEAD, branch, cleanliness. */
export async function preflight(path: string): Promise<PreflightResult> {
  if (!existsSync(path)) {
    return { ok: false, message: `路径不存在: ${path}`, suggestedCommands: [] }
  }
  if (!(await isGitRepo(path))) {
    return { ok: false, message: '不是 Git 仓库(无法固定共同基线)', suggestedCommands: [] }
  }
  const root = await repoRoot(path)
  const head = root ? await headCommit(root) : undefined
  if (!root || !head) {
    return { ok: false, message: '无法读取仓库 HEAD(空仓库?)', suggestedCommands: [] }
  }
  const branch = await currentBranch(root)
  const dirty = await statusPorcelain(root)
  return {
    ok: true,
    repoPath: root,
    head,
    branch,
    clean: dirty.length === 0,
    dirtyEntries: dirty,
    suggestedCommands: branch ? [] : [],
  }
}

/**
 * Create an isolated worktree for one lane at `dest`, pinned to `commit`.
 * Uses `git worktree add --detach` so lanes never create or move branches.
 */
export async function createWorktree(repoPath: string, commit: string, dest: string): Promise<void> {
  await git(repoPath, 'worktree', 'add', '--detach', dest, commit)
}

/**
 * Remove one lane worktree. Only ever called with paths Arena itself created
 * (under ~/.dsh/arena/<id>/worktrees); the path is additionally validated to
 * be inside the arena home before any destructive call.
 */
export async function removeWorktree(laneWorktree: string, arenaRootForId: string): Promise<void> {
  if (!laneWorktree.startsWith(arenaRootForId)) {
    throw new Error(`refusing to remove worktree outside arena home: ${laneWorktree}`)
  }
  if (!existsSync(laneWorktree)) return
  try {
    await exec('git', ['worktree', 'remove', '--force', laneWorktree])
  } catch {
    /* direct delete below */
  }
  if (existsSync(laneWorktree)) {
    const { rm } = await import('node:fs/promises')
    await rm(laneWorktree, { recursive: true, force: true })
  }
}

/** Prune stale worktree metadata for a repo (safe, bookkeeping-only). */
export async function pruneWorktrees(repoPath: string): Promise<void> {
  await tryGit(repoPath, 'worktree', 'prune')
}

export interface DiffStats {
  patch: string
  files: readonly ChangedFile[]
  additions: number
  deletions: number
}

function parseNameStatus(nameStatus: string, numstat: string): ChangedFile[] {
  const paths = nameStatus.split('\0').filter((p) => p !== '')
  const stats = numstat.split('\n').filter((l) => l.trim() !== '')
  const out: ChangedFile[] = []
  let i = 0
  let s = 0
  while (i < paths.length) {
    // name-status with -z: [status, path] pairs, rename adds a second path
    const status = paths[i]!
    const path = paths[i + 1] ?? ''
    i += 2
    let additions = 0
    let deletions = 0
    if (status.startsWith('R') || status.startsWith('C')) {
      // renamed/copied: [old, new] pair consumed one extra slot
      i += 1
    }
    if (s < stats.length) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(stats[s]!)
      if (m) {
        additions = m[1] === '-' ? 0 : Number(m[1])
        deletions = m[2] === '-' ? 0 : Number(m[2])
      }
      s += 1
    }
    out.push({ path, additions, deletions })
  }
  return out
}

/** Capture the lane's full change set vs the baseline commit. */
export async function captureDiff(worktree: string, baseline: string): Promise<DiffStats> {
  const [nameStatus, numstat, patch] = await Promise.all([
    git(worktree, 'diff', '--name-status', '-z', baseline),
    git(worktree, 'diff', '--numstat', baseline),
    git(worktree, 'diff', '--binary', baseline),
  ])
  const files = parseNameStatus(nameStatus.stdout, numstat.stdout)
  const additions = files.reduce((acc, f) => acc + f.additions, 0)
  const deletions = files.reduce((acc, f) => acc + f.deletions, 0)
  return { patch: patch.stdout, files, additions, deletions }
}

/** Create a branch at the lane worktree HEAD (user-confirmed action). */
export async function createBranch(worktree: string, name: string): Promise<{ branch: string; commit: string }> {
  await git(worktree, 'branch', name)
  const commit = (await git(worktree, 'rev-parse', 'HEAD')).stdout.trim()
  return { branch: name, commit }
}

export function tail(text: string, max = MAX_STDOUT_TAIL): string {
  if (text.length <= max) return text
  return `…${text.slice(text.length - max)}`
}

export { git as gitExec }
