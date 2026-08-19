/**
 * Report export: self-contained offline HTML + raw JSON, per-lane unified
 * patch, and winner branch creation. Everything is explicit and local — no
 * auto-push, no network.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArenaExperiment, BranchResult, ExportResult } from './types.ts'
import { createBranch } from './git.ts'
import { experimentDir, worktreePath } from './util.ts'
import { escapeHtml } from './html.ts'

export async function exportReport(exp: ArenaExperiment, includeDiff: boolean, diffs: readonly { label: string; patch: string }[]): Promise<ExportResult> {
  const dir = join(experimentDir(exp.id), 'exports')
  await mkdir(dir, { recursive: true })
  const jsonPath = join(dir, 'report.json')
  const htmlPath = join(dir, 'report.html')

  await writeFile(jsonPath, `${JSON.stringify(exp, null, 2)}\n`, 'utf8')
  const html = buildHtml(exp, includeDiff, diffs)
  await writeFile(htmlPath, html, 'utf8')
  return { path: htmlPath, bytes: Buffer.byteLength(html) }
}

export async function createWinnerBranch(exp: ArenaExperiment, label: string): Promise<{ ok: true; value: BranchResult } | { ok: false; message: string }> {
  const lane = exp.lanes.find((l) => l.label === label)
  if (!lane) return { ok: false, message: `赛道 ${label} 不存在` }
  if (!exp.demo) {
    // Real lanes only: branch from the lane worktree HEAD.
    const branchName = `arena/${exp.id}/${label}`
    try {
      const result = await createBranch(worktreePath(exp.id, label as ArenaExperiment['lanes'][number]['label']), branchName)
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: false, message: '演示比赛不创建分支' }
}

export function buildHtml(exp: ArenaExperiment, includeDiff: boolean, diffs: readonly { label: string; patch: string }[]): string {
  const date = new Date(exp.createdAt).toISOString().replace('T', ' ').slice(0, 19)
  const lanesHtml = exp.lanes
    .map((lane) => {
      const status = lane.status
      const passBadge =
        lane.passed === undefined ? '' : lane.passed ? '<span class="badge pass">✓ 测试通过</span>' : '<span class="badge fail">✗ 测试未通过</span>'
      const identity = lane.identity ? `<div class="identity">${escapeHtml(lane.identity.label)}</div>` : '<div class="identity masked">未揭晓</div>'
      const tokens =
        lane.tokens === undefined
          ? ''
          : lane.tokens.source === 'unknown'
            ? '<div class="meta">tokens: 未知</div>'
            : `<div class="meta">tokens: in ${lane.tokens.input.toLocaleString()} / out ${lane.tokens.output.toLocaleString()}${lane.tokens.cacheRead + lane.tokens.cacheWrite > 0 ? ` / cache ${(lane.tokens.cacheRead + lane.tokens.cacheWrite).toLocaleString()}` : ''}</div>`
      const files =
        lane.changedFilesCount === undefined
          ? ''
          : `<div class="meta">files: ${lane.changedFilesCount} (+${lane.additions ?? 0}/−${lane.deletions ?? 0})</div>`
      const dur = lane.durationMs === undefined ? '' : `<div class="meta">time: ${(lane.durationMs / 1000).toFixed(1)}s</div>`
      const verify = (lane.verification ?? [])
        .map(
          (v) =>
            `<div class="vrun"><code>${escapeHtml(v.command)}</code> <span class="${v.exitCode === 0 ? 'ok' : 'bad'}">${v.timedOut ? 'TIMEOUT' : v.spawnError ? 'SPAWN-ERROR' : `exit ${v.exitCode}`}</span> <span class="dur">${(v.durationMs / 1000).toFixed(1)}s</span></div>`,
        )
        .join('')
      const answer = lane.finalAnswer ? `<pre class="answer">${escapeHtml(lane.finalAnswer)}</pre>` : ''
      const diffSection =
        includeDiff && diffs.find((d) => d.label === lane.label)?.patch
          ? `<details class="diff"><summary>diff</summary><pre>${escapeHtml(diffs.find((d) => d.label === lane.label)!.patch)}</pre></details>`
          : ''
      const verdictMark =
        exp.verdict?.winner === lane.label ? '<div class="win-mark">★ 盲选冠军</div>' : ''
      return `<section class="lane">
        <h3>Lane ${escapeHtml(lane.label)} <span class="status s-${status}">${status}</span> ${passBadge}</h3>
        ${identity}
        ${verdictMark}
        ${dur}${tokens}${files}
        ${verify}
        ${answer}
        ${diffSection}
      </section>`
    })
    .join('\n')

  const deviations =
    exp.deviations.length === 0
      ? ''
      : `<section class="deviations"><h2>偏差记录 (实验可比性: ${exp.comparability === 'ok' ? '正常' : '降级'})</h2><ul>${exp.deviations.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul></section>`

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH Arena — ${escapeHtml(exp.id)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.6 -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; padding: 32px; max-width: 980px; margin-inline: auto; }
  header { border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; }
  .task { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin: 16px 0; white-space: pre-wrap; }
  .lane { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; margin: 14px 0; }
  .lane h3 { margin: 0 0 8px; font-size: 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .status { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #e5e7eb; }
  .s-done { background: #d1fae5; } .s-failed, .s-timeout { background: #fee2e2; } .s-cancelled { background: #f3f4f6; }
  .badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
  .badge.pass { background: #d1fae5; color: #065f46; } .badge.fail { background: #fee2e2; color: #991b1b; }
  .identity { font-family: ui-monospace, monospace; font-size: 13px; color: #4f46e5; margin-bottom: 6px; }
  .identity.masked { color: #9ca3af; }
  .meta { font-size: 12.5px; color: #6b7280; font-family: ui-monospace, monospace; }
  .vrun { font-size: 12.5px; font-family: ui-monospace, monospace; margin: 2px 0; }
  .vrun .ok { color: #059669; } .vrun .bad { color: #dc2626; } .vrun .dur { color: #9ca3af; }
  .answer { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; white-space: pre-wrap; font-size: 13px; overflow-x: auto; }
  .diff summary { cursor: pointer; font-size: 13px; color: #4f46e5; }
  .diff pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; max-height: 480px; }
  .win-mark { color: #d97706; font-weight: 700; font-size: 13px; margin-top: 6px; }
  .deviations { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 20px; }
  .deviations ul { margin: 8px 0; padding-left: 20px; }
  footer { margin-top: 32px; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style>
</head>
<body>
<header>
  <h1>DSH Arena 实验报告</h1>
  <div class="sub">${escapeHtml(exp.id)} · ${date} · ${exp.demo ? '演示模式' : '真实运行'} · ${escapeHtml(exp.repoPath)} @ ${escapeHtml(exp.baselineCommit.slice(0, 10))}</div>
</header>
<div class="task"><strong>任务</strong> — ${escapeHtml(exp.task)}</div>
<div class="task"><strong>验证</strong> — ${exp.verifyCommands.map((c) => `<code>${escapeHtml(c)}</code>`).join(' ')}</div>
${lanesHtml}
${deviations}
<footer>由 DSH Arena 生成 · 本报告离线自包含 · ${exp.phase === 'revealed' ? '身份已揭晓' : '身份未揭晓(报告不含模型信息)'} · 盲评不是科学双盲,模型文风可能暴露身份</footer>
</body>
</html>
`
}
