import { useEffect, useState } from 'react'
import type { ArenaExperiment, ArenaLane } from '../../types.ts'
import { arenaClient } from '../ArenaApp.tsx'

const STATUS_TEXT: Record<ArenaLane['status'], string> = {
  queued: '排队',
  preparing: '准备 worktree',
  running: '运行中',
  verifying: '验证中',
  done: '完成',
  failed: '失败',
  timeout: '超时',
  cancelled: '已取消',
  blocked: '等待人工',
}

const STATUS_CLASS: Record<ArenaLane['status'], string> = {
  queued: 'pill', preparing: 'pill', running: 'pill live', verifying: 'pill warn',
  done: 'pill ok', failed: 'pill bad', timeout: 'pill bad', cancelled: 'pill', blocked: 'pill warn',
}

function elapsed(lane: ArenaLane, now: number): number {
  const start = lane.startedAt ?? 0
  const end = lane.endedAt ?? now
  return start === 0 ? 0 : end - start
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export function RaceView(props: { exp: ArenaExperiment; toast: (t: string, e?: boolean) => void }): JSX.Element {
  const { exp } = props
  const [now, setNow] = useState(Date.now())
  const [cancelling, setCancelling] = useState(false)
  const timeoutAt = exp.createdAt + exp.timeoutMs + 120_000

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const cancelAll = async (): Promise<void> => {
    if (!window.confirm('取消整场比赛?已产生的改动会保留待清理,不会再有 Agent 继续运行。')) return
    setCancelling(true)
    try {
      await arenaClient().cancel(exp.id)
      props.toast('已请求取消,赛道正陆续进入终态')
    } catch (e) {
      props.toast(String(e), true)
    } finally {
      setCancelling(false)
    }
  }

  const finished = exp.lanes.filter((l) => ['done', 'failed', 'timeout', 'cancelled', 'blocked'].includes(l.status)).length

  return (
    <div>
      <div className="card">
        <div className="row between">
          <div>
            <h3>{exp.demo ? '演示比赛' : '比赛进行中'}</h3>
            <div className="muted mono">{exp.id} · {exp.repoPath} @ {exp.baselineCommit.slice(0, 10)}</div>
          </div>
          <div className="row">
            {exp.demo && <span className="pill demo">演示模式 · 无真实模型调用</span>}
            <span className="pill live">{finished}/{exp.lanes.length} 到达终态</span>
            <button className="danger small" disabled={cancelling} onClick={() => void cancelAll()}>
              {cancelling ? '取消中…' : '取消比赛'}
            </button>
          </div>
        </div>
        <div className="callout" style={{ marginTop: 12 }}>
          <strong>任务</strong> — {exp.task}
          <div className="muted" style={{ marginTop: 4 }}>验证: {exp.verifyCommands.map((c) => <code key={c} className="mono">{c}</code>)}</div>
        </div>
      </div>

      <div className={`lanes ${exp.lanes.length <= 2 ? 'two' : exp.lanes.length === 3 ? 'three' : 'four'}`}>
        {exp.lanes.map((lane) => (
          <LaneCard key={lane.label} lane={lane} now={now} timeoutAt={timeoutAt} />
        ))}
      </div>

      <div className="muted" style={{ textAlign: 'center', marginTop: 18 }}>
        完成最快 ≠ 获胜 — 揭晓前请基于代码、测试与解释做盲评。
      </div>
    </div>
  )
}

function LaneCard(props: { lane: ArenaLane; now: number; timeoutAt: number }): JSX.Element {
  const { lane, now } = props
  const isActive = lane.status === 'running' || lane.status === 'verifying' || lane.status === 'preparing'
  const dur = elapsed(lane, now)
  const progress =
    lane.status === 'done' ? 100
    : lane.status === 'failed' || lane.status === 'timeout' || lane.status === 'cancelled' ? 100
    : lane.status === 'verifying' ? 85
    : lane.status === 'running' ? Math.min(70, (dur / 60_000) * 8)
    : lane.status === 'preparing' ? 8
    : 0
  const errClass = ['failed', 'timeout'].includes(lane.status) ? 'err' : lane.status === 'done' ? 'done' : ''

  return (
    <div className="lane">
      <div className="head">
        <div className={`badge b-${lane.label}`}>{lane.label}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Lane {lane.label}</div>
          <div className="muted" style={{ fontSize: 12 }}>{STATUS_TEXT[lane.status]}</div>
        </div>
        <span className={STATUS_CLASS[lane.status]}>{lane.status}</span>
      </div>

      {isActive && (
        <div className="countdown">
          {fmtDuration(dur)} / 上限 {Math.round((props.timeoutAt - props.now) > 0 ? (props.timeoutAt - lane.startedAt!) / 1000 : 0)}s
        </div>
      )}
      {!isActive && lane.durationMs !== undefined && (
        <div className="countdown">用时 {fmtDuration(lane.durationMs)}</div>
      )}

      <div className={`progress ${errClass}`}>
        <div className="bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="feed" aria-live="polite">
        {[...lane.feed].reverse().map((item, i) => (
          <div key={`${item.t}-${i}`} className={item.ok === false ? 'err' : ''}>
            {item.k === 'tool' ? `⚙ ${item.text}` : item.k === 'msg' ? '💬 回复文本' : item.k === 'turn' ? `🏁 ${item.text}` : item.text}
          </div>
        ))}
        {lane.feed.length === 0 && <div className="muted">等待活动…</div>}
      </div>

      {lane.error && <div className="pill bad" style={{ alignSelf: 'flex-start' }}>{lane.error.slice(0, 120)}</div>}

      <div className="metrics">
        {lane.changedFilesCount !== undefined && (
          <><div className="k">改动文件</div><div>{lane.changedFilesCount} (+{lane.additions}/−{lane.deletions})</div></>
        )}
        {lane.tokens !== undefined && (
          <><div className="k">tokens</div><div>{lane.tokens.source === 'unknown' ? '未知' : `in ${lane.tokens.input} / out ${lane.tokens.output}`}</div></>
        )}
      </div>
    </div>
  )
}
