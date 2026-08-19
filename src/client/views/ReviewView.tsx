import { useEffect, useState } from 'react'
import type { ArenaExperiment, ArenaLane, ArenaVerdict, LaneLabel } from '../../types.ts'
import { arenaClient } from '../ArenaApp.tsx'

function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtTokens(lane: ArenaLane): string {
  if (!lane.tokens) return '—'
  if (lane.tokens.source === 'unknown') return '未知'
  const parts = [`in ${lane.tokens.input.toLocaleString()}`, `out ${lane.tokens.output.toLocaleString()}`]
  const cache = lane.tokens.cacheRead + lane.tokens.cacheWrite
  if (cache > 0) parts.push(`cache ${cache.toLocaleString()}`)
  return parts.join(' / ')
}

export function ReviewView(props: {
  exp: ArenaExperiment
  refresh: () => void
  toast: (t: string, e?: boolean) => void
  onExit: () => void
}): JSX.Element {
  const { exp } = props
  const [selected, setSelected] = useState<LaneLabel | undefined>()
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Record<string, 'answer' | 'diff' | 'verify'>>({})
  const [diffs, setDiffs] = useState<Record<string, string>>({})

  useEffect(() => {
    for (const lane of exp.lanes) {
      if (diffs[lane.label] === undefined && (lane.diffBytes ?? 0) > 0) {
        void arenaClient().diff(exp.id, lane.label).then((patch) => {
          setDiffs((prev) => ({ ...prev, [lane.label]: patch }))
        }).catch(() => setDiffs((prev) => ({ ...prev, [lane.label]: '' })))
      }
    }
  }, [exp, diffs])

  const saveVerdict = async (kind: ArenaVerdict['kind'], winner?: LaneLabel): Promise<void> => {
    setSaving(true)
    try {
      const verdict: ArenaVerdict = kind === 'winner'
        ? { kind: 'winner', winner: winner!, savedAt: Date.now() }
        : kind === 'skipped'
          ? { kind: 'skipped', savedAt: Date.now(), skippedReason: '用户选择跳过盲评直接揭晓' }
          : { kind, savedAt: Date.now() }
      await arenaClient().verdict(exp.id, verdict)
      props.toast(kind === 'winner' ? `已记录盲选: Lane ${winner}` : '已记录判断')
      props.refresh()
    } catch (e) {
      props.toast(String(e), true)
    } finally {
      setSaving(false)
    }
  }

  const reveal = async (): Promise<void> => {
    const hasVerdict = exp.verdict !== undefined || selected !== undefined
    const confirmText = hasVerdict
      ? '揭晓各赛道身份?揭晓后不可撤销。'
      : '你还没有保存盲评判断。跳过盲评直接揭晓会被记录在实验里,继续?'
    if (!window.confirm(confirmText)) return
    try {
      if (!exp.verdict && selected) await saveVerdict('winner', selected)
      await arenaClient().reveal(exp.id)
      props.toast('已揭晓')
      props.refresh()
    } catch (e) {
      props.toast(String(e), true)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="row between">
          <div>
            <h3>盲评 — {exp.lanes.length} 条匿名赛道</h3>
            <div className="muted mono">{exp.id}</div>
          </div>
          <div className="row">
            {exp.demo && <span className="pill demo">演示</span>}
            {exp.comparability === 'degraded' && <span className="pill bad">可比性降级</span>}
          </div>
        </div>
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>任务</strong> — {exp.task}
          <div className="muted" style={{ marginTop: 4 }}>验证: {exp.verifyCommands.map((c) => <code key={c} className="mono">{c}</code>)}</div>
        </div>
        {exp.comparability === 'degraded' && (
          <div className="callout warn">
            <strong>本实验存在偏差,结果需谨慎比较:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {exp.deviations.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="lanes">
        {exp.lanes.map((lane) => (
          <div key={lane.label} className="lane" style={{ cursor: 'pointer', borderColor: selected === lane.label ? '#d97706' : undefined }}
            onClick={() => setSelected(lane.label)}>
            <div className="head">
              <div className={`badge b-${lane.label}`}>{lane.label}</div>
              <div style={{ flex: 1, fontWeight: 700 }}>Lane {lane.label}</div>
              {lane.passed === true && <span className="pill ok">测试通过</span>}
              {lane.passed === false && <span className="pill bad">测试未通过</span>}
              {selected === lane.label && <span className="pill warn">盲选中</span>}
            </div>

            <div className="metrics">
              <div className="k">用时</div><div>{lane.durationMs !== undefined ? fmtDuration(lane.durationMs) : '—'}</div>
              <div className="k">tokens</div><div>{fmtTokens(lane)}</div>
              <div className="k">改动</div><div>{lane.changedFilesCount !== undefined ? `${lane.changedFilesCount} files (+${lane.additions}/−${lane.deletions})` : '—'}</div>
              <div className="k">状态</div><div>{lane.status}{lane.error ? ` · ${lane.error.slice(0, 60)}` : ''}</div>
            </div>

            <LaneDetails lane={lane} patch={diffs[lane.label]} />
          </div>
        ))}
      </div>

      <div className="card">
        <h3>你的判断</h3>
        <p className="muted">点选一条赛道作为盲选冠军,或使用下面的选项。判断会先保存,再揭晓。</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          <button className="primary" disabled={selected === undefined || saving || exp.verdict !== undefined}
            onClick={() => void saveVerdict('winner', selected)}>
            {exp.verdict?.kind === 'winner' ? `已盲选 Lane ${exp.verdict.winner}` : selected ? `盲选 Lane ${selected} 为冠军` : '先点选一条赛道'}
          </button>
          <button className="ghost" disabled={saving || exp.verdict !== undefined} onClick={() => void saveVerdict('tie')}>判定平局</button>
          <button className="ghost" disabled={saving || exp.verdict !== undefined} onClick={() => void saveVerdict('all-fail')}>全部不合格</button>
          <div style={{ flex: 1 }} />
          <button className="danger" disabled={saving} onClick={() => void reveal()}>
            {exp.verdict ? '🎭 揭晓' : '跳过盲评并揭晓(会记录)'}
          </button>
        </div>
        {exp.verdict && (
          <div className="callout warn" style={{ marginTop: 12 }}>
            已保存判断:{exp.verdict.kind === 'winner' ? `Lane ${exp.verdict.winner}` : exp.verdict.kind} — 可直接揭晓。
          </div>
        )}
      </div>
    </div>
  )
}

function LaneDetails(props: { lane: ArenaLane; patch?: string }): JSX.Element | null {
  const { lane } = props
  const [tab, setTab] = useState<'answer' | 'diff' | 'verify'>('answer')
  const hasDiff = (lane.diffBytes ?? 0) > 0
  const hasVerify = (lane.verification?.length ?? 0) > 0
  if (!lane.finalAnswer && !hasDiff && !hasVerify) return null

  return (
    <div>
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {lane.finalAnswer && <button className={`small ${tab === 'answer' ? 'primary' : 'ghost'}`} onClick={(e) => { e.stopPropagation(); setTab('answer') }}>最终回答</button>}
        {hasDiff && <button className={`small ${tab === 'diff' ? 'primary' : 'ghost'}`} onClick={(e) => { e.stopPropagation(); setTab('diff') }}>Diff ({lane.changedFilesCount})</button>}
        {hasVerify && <button className={`small ${tab === 'verify' ? 'primary' : 'ghost'}`} onClick={(e) => { e.stopPropagation(); setTab('verify') }}>验证</button>}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {tab === 'answer' && lane.finalAnswer && <pre className="answer">{lane.finalAnswer}</pre>}
        {tab === 'verify' && (
          <div>
            {lane.verification!.map((v, i) => (
              <div key={i} className="verify-row">
                <span className={v.exitCode === 0 ? 'exit0' : 'exitN'}>
                  {v.timedOut ? 'TIMEOUT' : v.spawnError ? 'SPAWN-ERR' : `exit ${v.exitCode}`}
                </span>
                <span className="cmd">{v.command}</span>
                <span className="muted">{fmtDuration(v.durationMs)}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'diff' && (
          props.patch === undefined
            ? <div className="muted">载入 diff…</div>
            : props.patch === ''
              ? <div className="muted">无改动</div>
              : <pre className="patch">{highlightPatch(props.patch)}</pre>
        )}
      </div>
    </div>
  )
}

function highlightPatch(patch: string): JSX.Element {
  const lines = patch.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const cls = line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : line.startsWith('@@') ? 'hunk' : ''
        return <div key={i} className={cls}>{line || ' '}</div>
      })}
    </>
  )
}
