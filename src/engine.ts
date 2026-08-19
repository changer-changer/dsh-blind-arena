/**
 * Experiment orchestration: preflight → worktrees → lanes (agents) →
 * verification → diff capture → persisted record with server-side identities.
 *
 * Anonymity contract implemented here:
 *  - lane labels are assigned to participants in RANDOM order at creation;
 *  - the persisted experiment.json contains no identities;
 *  - identities live in secrets.json and only merge after the reveal call.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { runLane } from './runner.ts'
import { runVerification } from './verify.ts'
import { captureDiff, createWorktree, preflight, pruneWorktrees, removeWorktree } from './git.ts'
import {
  type ArenaExperiment,
  type ArenaLane,
  type ArenaSecrets,
  type CreateParticipantInput,
  LANE_LABELS,
  type LaneLabel,
  type LaneStatus,
  type ParticipantSpec,
  type VerificationRun,
} from './types.ts'
import { experimentDir, randomLaneOrder, worktreesDir, worktreePath as laneWorktreePath } from './util.ts'
import type { ExperimentStore } from './store.ts'

export interface EngineEvents {
  onLaneUpdate?: (id: string, lane: ArenaLane) => void
  onExperimentUpdate?: (exp: ArenaExperiment) => void
}

export class ArenaEngine {
  private readonly ctx: Context
  private readonly store: ExperimentStore
  private readonly events: EngineEvents
  private readonly running = new Map<string, AbortController>()

  constructor(ctx: Context, store: ExperimentStore, events: EngineEvents = {}) {
    this.ctx = ctx
    this.store = store
    this.events = events
  }

  isRunning(id: string): boolean {
    return this.running.has(id)
  }

  async create(
    input: {
      repoPath: string
      task: string
      verifyCommands: readonly string[]
      timeoutMinutes: number
      participants: readonly CreateParticipantInput[]
      demo?: boolean
    },
  ): Promise<{ ok: true; value: ArenaExperiment } | { ok: false; message: string }> {
    if (this.running.size >= 2) {
      return { ok: false, message: '同时进行的比赛已达上限(2),请先等当前比赛结束' }
    }
    if (input.participants.length < 2 || input.participants.length > 4) {
      return { ok: false, message: '参赛者数量必须是 2~4' }
    }
    const task = input.task.trim()
    if (task === '') return { ok: false, message: '任务描述不能为空' }
    const commands = input.verifyCommands.map((c) => c.trim()).filter((c) => c !== '')
    if (commands.length === 0) return { ok: false, message: '至少需要一条验证命令' }

    const pre = await preflight(input.repoPath)
    if (!pre.ok || !pre.repoPath || !pre.head) {
      return { ok: false, message: pre.message ?? '仓库预检失败' }
    }
    if (!pre.clean) {
      return {
        ok: false,
        message: `工作区不干净(${pre.dirtyEntries?.length ?? 0} 处未提交改动)。请先提交或暂存,保证所有参赛者从同一基线出发。`,
      }
    }

    const { newExperimentId } = await import('./util.ts')
    const id = newExperimentId()
    const labels = LANE_LABELS.slice(0, input.participants.length)
    const order = randomLaneOrder(input.participants.length)

    const identities = {} as Record<LaneLabel, ParticipantSpec>
    const specs: ParticipantSpec[] = input.participants.map((p) => ({
      provider: p.provider,
      model: p.model,
      reasoningEffort: p.reasoningEffort || undefined,
      label: formatIdentity(p),
    }))
    labels.forEach((label, i) => {
      identities[label] = specs[order[i]!]!
    })

    const timeoutMs = Math.round(Math.max(1, Math.min(60, input.timeoutMinutes)) * 60_000)

    const lanes: ArenaLane[] = labels.map((label) => ({
      label,
      status: 'queued',
      worktreePath: laneWorktreePath(id, label),
      feed: [],
    }))

    const exp: ArenaExperiment = {
      id,
      createdAt: Date.now(),
      demo: input.demo === true,
      repoPath: pre.repoPath,
      repoBranch: pre.branch,
      baselineCommit: pre.head,
      baselineClean: true,
      task,
      verifyCommands: commands,
      timeoutMs,
      phase: 'running',
      lanes,
      deviations: [],
      comparability: 'ok',
    }

    const secrets: ArenaSecrets = {
      identities,
      agentSessions: Object.fromEntries(labels.map((l) => [l, ''])) as Record<LaneLabel, string>,
    }

    await this.store.save(exp, secrets)

    // Fire and supervise: failures land in the record, not the create call.
    void this.runExperiment(id, exp, secrets).catch(() => undefined)
    return { ok: true, value: exp }
  }

  /** Mutate one lane and emit the wire view (identity-free pre-reveal). */
  private async updateLane(exp: ArenaExperiment, label: LaneLabel, patch: Partial<ArenaLane>, secrets: ArenaSecrets): Promise<void> {
    const idx = exp.lanes.findIndex((l) => l.label === label)
    if (idx < 0) return
    const lane: ArenaLane = { ...exp.lanes[idx]!, ...patch }
    const lanes = [...exp.lanes]
    lanes[idx] = lane
    const next: ArenaExperiment = { ...exp, lanes }
    Object.assign(exp, next)
    await this.store.save(exp, secrets)
    this.events.onLaneUpdate?.(exp.id, lane)
  }

  private async runExperiment(id: string, exp: ArenaExperiment, secrets: ArenaSecrets): Promise<void> {
    const abort = new AbortController()
    this.running.set(id, abort)
    const deviations: string[] = []
    try {
      const wtDir = worktreesDir(id)
      await mkdir(wtDir, { recursive: true })

      for (const lane of exp.lanes) {
        await this.updateLane(exp, lane.label, { status: 'preparing' }, secrets)
        const dest = laneWorktreePath(id, lane.label)
        try {
          await createWorktree(exp.repoPath, exp.baselineCommit, dest)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          deviations.push(`${lane.label}: worktree 创建失败 — ${message}`)
          await this.updateLane(exp, lane.label, { status: 'failed', error: `worktree 创建失败: ${message}`, endedAt: Date.now() }, secrets)
        }
      }

      const ready = exp.lanes.filter((l) => exp.lanes.find((x) => x.label === l.label)?.status === 'preparing')

      await Promise.all(
        ready.map(async (lane) => {
          const identity = secrets.identities[lane.label]!
          const dest = laneWorktreePath(id, lane.label)
          const startedAt = Date.now()
          await this.updateLane(exp, lane.label, { status: 'running', startedAt }, secrets)

          if (exp.demo) {
            const { runDemoLane } = await import('./demo.ts')
            await runDemoLane({
              experiment: exp,
              laneLabel: lane.label,
              update: (patch) => this.updateLane(exp, lane.label, patch, secrets),
              seed: identity.model,
            })
            return
          }

          const result = await runLane({
            ctx: this.ctx,
            task: buildTaskPrompt(exp.task, exp.verifyCommands),
            worktree: dest,
            provider: identity.provider,
            model: identity.model,
            reasoningEffort: identity.reasoningEffort,
            timeoutMs: exp.timeoutMs,
          })

          const feed = [...lane.feed, ...result.feed]
          secrets.agentSessions[lane.label] = result.sessionId

          if (result.status !== 'done') {
            deviations.push(`${lane.label}: ${result.status}${result.error ? ` — ${result.error}` : ''}`)
          }

          await this.updateLane(
            exp,
            lane.label,
            {
              status: result.status,
              endedAt: Date.now(),
              durationMs: Date.now() - startedAt,
              feed,
              tokens: result.tokens,
              finalAnswer: result.finalAnswer,
              answerChars: result.finalAnswer.length,
              error: result.error,
            },
            secrets,
          )
        }),
      )

      // Verification + diff for every lane that produced anything.
      await Promise.all(
        exp.lanes.map(async (lane) => {
          const dest = laneWorktreePath(id, lane.label)
          if (lane.status !== 'done' && lane.status !== 'blocked' && lane.status !== 'failed') {
            if (lane.status === 'queued' || lane.status === 'preparing') {
              return
            }
          }
          if (lane.status === 'timeout' || lane.status === 'cancelled') {
            // Still capture the partial diff — evidence matters.
          }
          const mid = exp.lanes.find((l) => l.label === lane.label)!
          if (mid.status === 'queued' || mid.status === 'preparing') return

          if (mid.status === 'done' || mid.status === 'blocked' || mid.status === 'failed' || mid.status === 'timeout' || mid.status === 'cancelled') {
            await this.updateLane(exp, lane.label, { status: mid.status === 'done' ? 'verifying' : mid.status }, secrets)
            try {
              const verification: VerificationRun[] = []
              let passed: boolean | undefined
              if (mid.status === 'done' || mid.status === 'blocked' || mid.status === 'failed') {
                for (const command of exp.verifyCommands) {
                  const run = await runVerification(command, dest, exp.timeoutMs)
                  verification.push(run)
                  if (run.spawnError !== undefined) {
                    deviations.push(`${lane.label}: 验证命令无法启动 — ${run.spawnError}`)
                  }
                }
                passed = verification.every((v) => v.exitCode === 0)
              }
              const diffStats = await captureDiff(dest, exp.baselineCommit).catch(() => undefined)
              if (diffStats && diffStats.patch.length > 0) {
                await mkdir(join(experimentDir(id), 'diffs'), { recursive: true })
                await writeFile(join(experimentDir(id), 'diffs', `${lane.label}.patch`), diffStats.patch, 'utf8')
              }
              await this.updateLane(
                exp,
                lane.label,
                {
                  status: mid.status,
                  verification,
                  passed,
                  changedFiles: diffStats?.files,
                  changedFilesCount: diffStats?.files.length ?? 0,
                  additions: diffStats?.additions,
                  deletions: diffStats?.deletions,
                  diffBytes: diffStats?.patch.length,
                },
                secrets,
              )
            } catch (error) {
              deviations.push(`${lane.label}: 结果采集失败 — ${error instanceof Error ? error.message : String(error)}`)
              await this.updateLane(exp, lane.label, { status: 'failed', error: `结果采集失败: ${error instanceof Error ? error.message : String(error)}` }, secrets)
            }
          }
        }),
      )

      const final: ArenaExperiment = {
        ...exp,
        phase: 'review',
        deviations,
        comparability: deviations.length === 0 ? 'ok' : 'degraded',
      }
      Object.assign(exp, final)
      await this.store.save(exp, secrets)
      this.events.onExperimentUpdate?.(exp)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const final: ArenaExperiment = {
        ...exp,
        phase: 'review',
        deviations: [...exp.deviations, `arena 内部错误 — ${message}`],
        comparability: 'degraded',
      }
      Object.assign(exp, final)
      await this.store.save(exp, secrets).catch(() => undefined)
      this.events.onExperimentUpdate?.(exp)
    } finally {
      this.running.delete(id)
    }
  }

  async cancel(id: string): Promise<{ ok: boolean; message: string }> {
    const abort = this.running.get(id)
    if (!abort) return { ok: false, message: '比赛不在运行中' }
    abort.abort()
    return { ok: true, message: '已请求取消' }
  }

  /** Remove worktrees for lanes whose results the user no longer needs. */
  async cleanup(id: string, keep: readonly LaneLabel[]): Promise<{ ok: boolean; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: '实验不存在' }
    const { exp } = loaded
    if (this.running.has(id)) return { ok: false, message: '比赛仍在运行,先取消再清理' }
    const root = worktreesDir(id)
    const removed: string[] = []
    const kept: string[] = []
    for (const lane of exp.lanes) {
      const dest = laneWorktreePath(id, lane.label)
      if (keep.includes(lane.label)) {
        kept.push(dest)
        continue
      }
      try {
        await removeWorktree(dest, root)
        removed.push(dest)
      } catch {
        kept.push(dest)
      }
    }
    await pruneWorktrees(exp.repoPath).catch(() => undefined)
    return { ok: true, message: `已清理 ${removed.length} 个工作区,保留 ${kept.length} 个` }
  }
}

export function formatIdentity(p: CreateParticipantInput): string {
  const effort = p.reasoningEffort ? ` (${p.reasoningEffort})` : ''
  return `${p.provider} / ${p.model}${effort}`
}

function buildTaskPrompt(task: string, verifyCommands: readonly string[]): string {
  const lines = [
    task,
    '',
    '验收方式:完成后请在仓库中运行以下命令并确保通过(不要修改测试来让它们通过):',
    ...verifyCommands.map((c) => `- ${c}`),
  ]
  return lines.join('\n')
}
