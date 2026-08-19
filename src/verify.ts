import { spawn } from 'node:child_process'
import { type VerificationRun, VERIFICATION_TIMEOUT_MS } from './types.ts'
import { tail } from './git.ts'

const VERIFICATION_VERIFY_TIMEOUT_MS = 10 * 60_000

function shellCommand(command: string, cwd: string): { file: string; args: string[] } {
  return { file: '/bin/bash', args: ['-lc', command] }
}

interface RawRun {
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
  spawnError?: string
  durationMs: number
}

function runOnce(command: string, cwd: string, timeoutMs: number): Promise<RawRun> {
  return new Promise((resolve) => {
    const started = Date.now()
    const { file, args } = shellCommand(command, cwd)
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, args, {
        cwd,
        env: { ...process.env, CI: '1', NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        exitCode: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        spawnError: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      })
      return
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Kill the whole process group: bash -l spawns children.
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          /* already dead */
        }
      }
      resolve({
        exitCode: null,
        timedOut: true,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > 512 * 1024) stdout = stdout.slice(-256 * 1024)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 512 * 1024) stderr = stderr.slice(-256 * 1024)
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr,
        spawnError: error.message,
        durationMs: Date.now() - started,
      })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode: code,
        timedOut: false,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      })
    })
  })
}

/** Run the same verification command inside one lane worktree. */
export async function runVerification(
  command: string,
  cwd: string,
  timeoutMs = VERIFICATION_TIMEOUT_MS,
): Promise<VerificationRun> {
  const raw = await runOnce(command, cwd, Math.min(timeoutMs, VERIFICATION_VERIFY_TIMEOUT_MS))
  return {
    command,
    exitCode: raw.exitCode,
    timedOut: raw.timedOut,
    durationMs: raw.durationMs,
    stdoutTail: tail(raw.stdout),
    stderrTail: tail(raw.stderr),
    spawnError: raw.spawnError,
  }
}
