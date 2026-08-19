import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LANE_LABELS, type LaneLabel } from './types.ts'

/** Arena home: ~/.dsh/arena */
export function arenaHome(): string {
  return join(homedir(), '.dsh', 'arena')
}

export function experimentDir(id: string): string {
  return join(arenaHome(), id)
}

export function worktreesDir(id: string): string {
  return join(experimentDir(id), 'worktrees')
}

export function worktreePath(id: string, label: LaneLabel): string {
  return join(worktreesDir(id), label)
}

export function secretsPath(id: string): string {
  return join(experimentDir(id), 'secrets.json')
}

export function experimentPath(id: string): string {
  return join(experimentDir(id), 'experiment.json')
}

export function diffPath(id: string, label: LaneLabel): string {
  return join(experimentDir(id), 'diffs', `${label}.patch`)
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Human-sortable experiment id: ar-20260818-2143-7k2f */
export function newExperimentId(now = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
  let rand = ''
  for (let i = 0; i < 4; i += 1) {
    rand += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return `ar-${stamp}-${rand}`
}

export function newSessionId(): string {
  return `session-${randomUUID()}`
}

/** Fisher–Yates over a copy. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/** Random lane-label assignment: lanes[i] runs participants[order[i]]. */
export function randomLaneOrder(participantCount: number): readonly number[] {
  return shuffled([...Array(participantCount).keys()])
}

export function laneLabelsFor(count: number): readonly LaneLabel[] {
  return LANE_LABELS.slice(0, count)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}
