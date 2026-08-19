import { useEffect, useState } from 'react'
import type { ArenaExperiment, LaneLabel } from '../../types.ts'
import { arenaClient } from '../ArenaApp.tsx'

export function RevealView(props: {
  exp: ArenaExperiment
  toast: (t: string, e?: boolean) => void
  onExit: () => void
}): JSX.Element {
  const { exp } = props
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  const [exporting, setExporting] = useState(false)
  const [cleanupConfirm, setCleanupConfirm] = useState(false)

  useEffect(() => {
    const timers = exp.lanes.map((lane, i) =>
      setTimeout(() => setFlipped((prev) => ({ ...prev, [lane.label]: true })), 350 + i * 450),
    )
    return () => timers.forEach(clearTimeout)
  }, [exp.lanes])

  const blindWinner = exp.verdict?.winner
  const blindMatch = blindWinner !== undefined && exp.verdict?.kind === 'winner'

  const exportReport = async (includeDiff: boolean): Promise<void> => {
    setExporting(true)
    try {
      const result = await arenaClient().export(exp.id, includeDiff)
      props.toast(`已导出: ${result.path}`)
    } catch (e) {
      props.toast(String(e), true)
    } finally {
      setExporting(false)
    }
  }

  const openWinnerDir = (label: LaneLabel): void => {
    const lane = exp.lanes.find((l) => l.label === label)
    if (!lane) return
    void navigator.clipboard?.writeText(lane.worktreePath).then(
      () => props.toast(`已复制 ${label} 工作目录: ${lane.worktreePath}`),
      () => props.toast(lane.worktreePath),
    )
  }

  const branchWinner = async (label: LaneLabel): Promise<void> => {
    if (!window.confirm(`为 Lane ${label} 的结果在原仓库创建分支?分支指向该赛道的最终提交,不会合并、不会推送。`)) return
    try {
      const branch = await arenaClient().createWinnerBranch(exp.id, label)
      props.toast(`已创建分支 ${branch}`)
    } catch (e) {
      props.toast(String(e), true)
    }
  }

  const cleanup = async (keepWinner: boolean): Promise<void> => {
    const keep = keepWinner && blindWinner !== undefined ? [blindWinner] : []
    const desc = keepWinner && blindWinner !== undefined
      ? `清理除 Lane ${blindWinner} 以外的所有赛道工作区?(保留的目录可继续审查)`
      : `清理全部 ${exp.lanes.length} 个赛道工作区?补丁与报告会保留。`
    if (!window.confirm(desc)) return
    try {
      await arenaClient().cleanup(exp.id, keep)
      props.toast('清理完成')
    } catch (e) {
      props.toast(String(e), true)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="row between">
          <div>
            <h3>揭晓 — 你盲选了{blindMatch ? ` Lane ${blindWinner}` : blindWinner !== undefined ? ` Lane ${blindWinner}` : '(跳过盲评)'}</h3>
            <div className="muted mono">{exp.id}</div>
          </div>
          <div className="row">
            {exp.demo && <span className="pill demo">演示</span>}
            <span className="pill ok">已揭晓</span>
          </div>
        </div>
      </div>

      <div className={`lanes ${exp.lanes.length <= 2 ? 'two' : exp.lanes.length === 3 ? 'three' : 'four'}`} style={{ marginTop: 4 }}>
        {exp.lanes.map((lane) => {
          const isBlindPick = blindWinner === lane.label
          const realIdentity = lane.identity?.label ?? '未知'
          return (
            <div key={lane.label} className={`reveal-lane${flipped[lane.label] ? ' flipped' : ''}${isBlindPick ? ' match' : ''}`}>
              {isBlindPick && <div className="you-picked">★ 你的盲选</div>}
              <div className={`lbl badge b-${lane.label}`} style={{ width: 52, height: 52, fontSize: 24, margin: '0 auto 8px', borderRadius: 14 }}>{lane.label}</div>
              <div className="who mono">{flipped[lane.label] ? realIdentity : '…'}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>
                {lane.passed === true && <span className="pill ok" style={{ marginRight: 6 }}>测试通过</span>}
                {lane.passed === false && <span className="pill bad" style={{ marginRight: 6 }}>测试未通过</span>}
                {lane.status !== 'done' && <span className="pill" style={{ marginRight: 6 }}>{lane.status}</span>}
                {lane.changedFilesCount !== undefined ? `${lane.changedFilesCount} files` : ''}
              </div>
              {isBlindPick && blindMatch && (
                <div className="verdict-note">你盲选的赛道 = {realIdentity}</div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <h3>继续使用结果</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          {exp.lanes.map((lane) => (
            <button key={lane.label} className="ghost small" onClick={() => openWinnerDir(lane.label)}>
              复制 Lane {lane.label} 工作目录
            </button>
          ))}
        </div>
        {blindWinner !== undefined && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <button className="primary small" disabled={exp.demo} onClick={() => void branchWinner(blindWinner)}>
              {exp.demo ? '演示不建分支' : `为 Lane ${blindWinner} 创建分支`}
            </button>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          <button className="ghost small" disabled={exporting} onClick={() => void exportReport(false)}>导出 HTML 报告</button>
          <button className="ghost small" disabled={exporting} onClick={() => void exportReport(true)}>导出含 Diff 的完整报告</button>
        </div>
      </div>

      <div className="card">
        <h3>清理工作区</h3>
        <p className="muted">比赛产生的隔离 worktree 保存在 Arena 自己的目录下;清理只作用于 Arena 创建的精确路径,失败时宁可保留待人工处理,也不会扩大删除范围。</p>
        {cleanupConfirm ? (
          <div className="row" style={{ gap: 10, marginTop: 8 }}>
            <button className="ghost small" onClick={() => void cleanup(true)}>保留盲选冠军,清理其余</button>
            <button className="danger small" onClick={() => void cleanup(false)}>全部清理</button>
            <button className="ghost small" onClick={() => setCleanupConfirm(false)}>取消</button>
          </div>
        ) : (
          <button className="ghost small" style={{ marginTop: 8 }} onClick={() => setCleanupConfirm(true)}>清理…</button>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
        <button className="ghost" onClick={props.onExit}>← 返回实验列表</button>
      </div>
    </div>
  )
}
