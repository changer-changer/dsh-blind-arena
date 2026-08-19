import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runVerification } from './verify.ts'

async function tmpdirFor(test: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `dsh-arena-${test}-`))
  return dir
}

describe('runVerification', () => {
  it('returns exit 0 and a tail for a passing command', async () => {
    const cwd = await tmpdirFor('pass')
    try {
      const run = await runVerification('echo hello', cwd, 10_000)
      expect(run.exitCode).toBe(0)
      expect(run.timedOut).toBe(false)
      expect(run.spawnError).toBeUndefined()
      expect(run.command).toBe('echo hello')
      expect(run.durationMs).toBeGreaterThanOrEqual(0)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('captures a non-zero exit for a failing command', async () => {
    const cwd = await tmpdirFor('fail')
    try {
      const run = await runVerification('exit 7', cwd, 10_000)
      expect(run.exitCode).toBe(7)
      expect(run.timedOut).toBe(false)
      expect(run.spawnError).toBeUndefined()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('marks a command as timed out when it exceeds the deadline', async () => {
    const cwd = await tmpdirFor('timeout')
    try {
      const run = await runVerification('sleep 5', cwd, 300)
      expect(run.timedOut).toBe(true)
      expect(run.exitCode).toBeNull()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('tail truncates long output to a bounded window', async () => {
    const cwd = await tmpdirFor('tail')
    try {
      const run = await runVerification('node -e "process.stdout.write(\'x\'.repeat(10000))"', cwd, 10_000)
      expect(run.exitCode).toBe(0)
      // ellipsis + last 4000 chars
      expect(run.stdoutTail).toHaveLength(4_001)
      expect(run.stdoutTail.startsWith('…')).toBe(true)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('reports a non-zero exit for a missing binary (bash child fails)', async () => {
    const cwd = await tmpdirFor('spawn')
    try {
      // commands run through `bash -lc`, so a missing binary is a child
      // failure (non-zero exit), not a spawn error on the shell itself.
      const run = await runVerification('/definitely/not/a/binary 123', cwd, 10_000)
      expect(run.exitCode).not.toBe(0)
      expect(run.spawnError).toBeUndefined()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
