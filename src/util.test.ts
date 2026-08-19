import { describe, expect, it } from 'vitest'
import {
  arenaHome,
  clamp,
  diffPath,
  experimentDir,
  experimentPath,
  laneLabelsFor,
  newExperimentId,
  newSessionId,
  randomLaneOrder,
  secretsPath,
  shuffled,
  truncate,
  worktreePath,
  worktreesDir,
} from './util.ts'
import { LANE_LABELS } from './types.ts'

describe('util', () => {
  it('newExperimentId produces a human-sortable, bounded id', () => {
    const fixed = new Date('2026-08-18T21:43:00Z')
    const id = newExperimentId(fixed)
    // ar-YYYYMMDD-HHMM-xxxx
    expect(id).toMatch(/^ar-20260818-2143-[a-z0-9]{4}$/)
    const a = newExperimentId(fixed)
    const b = newExperimentId(fixed)
    expect(a).toHaveLength(21)
    expect(b).toHaveLength(21)
    expect(a).not.toBe(b)
  })

  it('newExperimentId uses UTC and pads month/day/hour/minute', () => {
    const jan = new Date('2026-01-05T03:04:00Z')
    expect(newExperimentId(jan)).toMatch(/^ar-20260105-0304-[a-z0-9]{4}$/)
  })

  it('newSessionId is unique per call', () => {
    expect(newSessionId()).not.toBe(newSessionId())
  })

  it('shuffled preserves the multiset (Fisher–Yates over a copy)', () => {
    const items = [1, 2, 3, 4, 5]
    const out = shuffled(items)
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
    // does not mutate the input
    expect(items).toEqual([1, 2, 3, 4, 5])
    // returns a new array
    expect(out).not.toBe(items)
  })

  it('randomLaneOrder returns a permutation of indices', () => {
    const order = randomLaneOrder(4)
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })

  it('laneLabelsFor slices the first N labels', () => {
    expect(laneLabelsFor(2)).toEqual(['A', 'B'])
    expect(laneLabelsFor(4)).toEqual(['A', 'B', 'C', 'D'])
    expect(laneLabelsFor(0)).toEqual([])
  })

  it('clamp bounds a value into [lo, hi]', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('truncate appends an ellipsis beyond max and keeps short text intact', () => {
    expect(truncate('hello', 5)).toBe('hello')
    expect(truncate('hello world', 5)).toBe('hell…')
    expect(truncate('', 3)).toBe('')
  })

  it('path helpers live under the arena home', () => {
    const id = 'ar-x'
    expect(experimentDir(id)).toBe(`${arenaHome()}${id ? `/ar-x` : ''}`)
    expect(worktreesDir(id)).toMatch(/ar-x\/worktrees$/)
    expect(worktreePath(id, 'A')).toMatch(/ar-x\/worktrees\/A$/)
    expect(secretsPath(id)).toMatch(/ar-x\/secrets\.json$/)
    expect(experimentPath(id)).toMatch(/ar-x\/experiment\.json$/)
    expect(diffPath(id, 'B')).toMatch(/ar-x\/diffs\/B\.patch$/)
  })

  it('LaneLabel vocabulary matches LANE_LABELS export', () => {
    expect(LANE_LABELS).toEqual(['A', 'B', 'C', 'D'])
  })
})
