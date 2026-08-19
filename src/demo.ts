/**
 * Deterministic demo lanes: no real model calls, no API cost.
 *
 * The demo is NOT a fake progress bar pretending to be a model — it is clearly
 * labeled "演示" everywhere and exercises the exact same pipeline (worktree →
 * change → verify → diff → review → reveal) with scripted edits, so the full
 * product loop can be evaluated without credentials.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArenaExperiment, ArenaLane, LaneFeedItem, LaneLabel } from './types.ts'
import { captureDiff } from './git.ts'
import { runVerification } from './verify.ts'
import { experimentDir, worktreePath } from './util.ts'

interface DemoScript {
  /** Lane's final relative capability: A-style "focused fix" vs "broad rewrite". */
  style: 'focused' | 'verbose' | 'broken' | 'timeout'
}

const SCRIPTS: readonly DemoScript[] = [
  { style: 'focused' },
  { style: 'verbose' },
  { style: 'broken' },
  { style: 'timeout' },
]

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const DEMO_ANSWERS: Record<DemoScript['style'], string> = {
  focused:
    '已按要求完成。改动集中在 `src/stats.js` 的 `median()`:空输入现在抛出带明确信息的 RangeError,并新增了空数组与单元素两个测试用例。全部测试通过,未改动其他文件。',
  verbose:
    '本次任务我做了三件事:\n\n1. **定位问题** —— `median()` 在空数组时返回 NaN,属于未定义行为,单元测试没有覆盖。\n2. **修复** —— 增加了空输入的防御分支,抛出 `RangeError("median of empty list")`;顺带把附近的 `mean()` 也加了同样的防御(超出了任务范围,但保持了行为一致性)。\n3. **验证** —— 跑通了 `npm test`。有一个边界测试失败:`median([1])` 应返回 1,当前实现返回 NaN,我认为这是原代码的另一个隐藏 bug,修复它会改变对外行为,建议单独处理。',
  broken:
    '修复完成了。我把 median 里的排序去掉了,因为排序对中位数不是必需的(数学上中位数只依赖顺序统计量,直接取中间下标即可)。测试有一个失败,但那个测试本身写错了,期望值和数学定义不符。',
  timeout:
    '(演示:该赛道在时间限制内未完成 —— 最后一个工具调用仍在执行时被超时终止。)',
}

export interface DemoLaneParams {
  readonly experiment: ArenaExperiment
  readonly laneLabel: LaneLabel
  readonly update: (patch: Partial<ArenaLane>) => Promise<void>
  /** Any per-run seed (demo ignores content; determinism comes from lane index). */
  readonly seed?: string
}

function demoScriptFor(laneIndex: number): DemoScript {
  return SCRIPTS[laneIndex % SCRIPTS.length]!
}

export async function runDemoLane(params: DemoLaneParams): Promise<void> {
  const { experiment, laneLabel, update } = params
  const laneIndex = experiment.lanes.findIndex((l) => l.label === laneLabel)
  const script = demoScriptFor(laneIndex)
  const wt = worktreePath(experiment.id, laneLabel)
  const feed: LaneFeedItem[] = []
  const push = (k: LaneFeedItem['k'], text: string, ok?: boolean): void => {
    feed.push({ t: Date.now(), k, text, ok })
  }

  const steps = script.style === 'timeout' ? 6 : 5
  for (let i = 0; i < steps; i += 1) {
    await sleep(500)
    push('tool', ['read_file', 'edit_file', 'run_command', 'run_command', 'write_file', 'edit_file'][i] ?? 'tool', true)
    await update({ feed: [...feed] })
  }

  if (script.style === 'timeout') {
    await update({ status: 'timeout', endedAt: Date.now(), error: '演示:超出时间限制' })
    return
  }

  // Scripted edit — real files in the real worktree.
  const readme = join(wt, 'ARENA-DEMO.md')
  await writeFile(readme, `${laneLabel} demo change\n`, 'utf8').catch(() => undefined)
  if (script.style !== 'broken') {
    await writeFile(join(wt, 'src', 'stats.js'), demoStatsPatch(script.style), 'utf8').catch(() => undefined)
  }

  push('msg', 'answer text')
  await update({
    status: 'verifying',
    feed: [...feed],
    finalAnswer: DEMO_ANSWERS[script.style],
    answerChars: DEMO_ANSWERS[script.style].length,
  })

  const verification = []
  for (const command of experiment.verifyCommands) {
    const run = await runVerification(command, wt, 120_000)
    verification.push(run)
  }
  const passed = verification.every((v) => v.exitCode === 0)
  push('turn', `turn ${passed ? 'completed' : 'failed'}`, passed)

  const diffStats = await captureDiff(wt, experiment.baselineCommit).catch(() => undefined)
  const { mkdir } = await import('node:fs/promises')
  if (diffStats && diffStats.patch.length > 0) {
    await mkdir(join(experimentDir(experiment.id), 'diffs'), { recursive: true })
    await writeFile(join(experimentDir(experiment.id), 'diffs', `${laneLabel}.patch`), diffStats.patch, 'utf8')
  }

  await update({
    status: 'done',
    endedAt: Date.now(),
    feed: [...feed],
    verification,
    passed,
    changedFiles: diffStats?.files,
    changedFilesCount: diffStats?.files.length ?? 0,
    additions: diffStats?.additions,
    deletions: diffStats?.deletions,
    diffBytes: diffStats?.patch.length,
    tokens: { source: 'unknown', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  })
}

function demoStatsPatch(style: DemoScript['style']): string {
  if (style === 'focused') {
    return `export function mean(xs) {
  if (xs.length === 0) throw new RangeError('mean of empty list');
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs) {
  if (xs.length === 0) throw new RangeError('median of empty list');
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
`
  }
  return `export function mean(xs) {
  if (xs.length === 0) throw new RangeError('mean of empty list');
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs) {
  if (xs.length === 0) throw new RangeError('median of empty list');
  const mid = Math.floor(xs.length / 2);
  return xs[mid];
}
`
}
