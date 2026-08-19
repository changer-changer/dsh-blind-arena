import type { ExperimentSummary } from '../../types.ts'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const PHASE_PILL: Record<ExperimentSummary['phase'], { cls: string; text: string }> = {
  running: { cls: 'pill live', text: '进行中' },
  review: { cls: 'pill warn', text: '待盲评' },
  revealed: { cls: 'pill ok', text: '已揭晓' },
}

export function ListView(props: {
  summaries: readonly ExperimentSummary[] | undefined
  onOpen: (id: string) => void
  onCreate: () => void
  onReload: () => void | Promise<void>
  heroArt: string
}): JSX.Element {
  const { summaries } = props
  if (!summaries) {
    return <div className="empty"><div className="big">⏳</div>载入实验列表…</div>
  }
  return (
    <div>
      <section className="ar-hero" style={{ backgroundImage: `url(${props.heroArt})` }}>
        <div className="ar-hero-copy">
          <span className="eyebrow">BLIND EVALUATION · DSH</span>
          <h1>先判断，再知道谁赢。</h1>
          <p>同一任务、同一基线、隔离工作树。让代码质量先于名字获得票数。</p>
          <button className="primary hero-cta" onClick={props.onCreate}>开始一场盲测 <span aria-hidden="true">↗</span></button>
        </div>
      </section>
      {summaries.length === 0 ? (
        <div className="empty compact-empty">
          <div className="big">◌</div>
          <h3>还没有比赛</h3>
          <p className="muted">把同一个真实编码任务交给 2~4 个匿名参赛者，先盲评，再揭晓。</p>
        </div>
      ) : (
        <section className="ar-section">
          <div className="section-heading"><span><span className="eyebrow">LIVE BOARD</span><strong>最近的比赛</strong></span><span className="muted">匿名直到揭晓</span></div>
          {summaries.map((s) => {
            const pill = PHASE_PILL[s.phase]
            const verdictText = s.verdict
              ? s.verdict.kind === 'winner'
                ? `盲选 ${s.verdict.winner}`
                : s.verdict.kind === 'ranking'
                  ? `排序 ${s.verdict.ranking?.join('>')}`
                  : s.verdict.kind === 'tie' ? '平局' : s.verdict.kind === 'all-fail' ? '全部不合格' : '未盲评'
              : ''
            return (
              <button type="button" key={s.id} className="card clickable" onClick={() => props.onOpen(s.id)}>
                <div className="row between">
                  <h3 className="mono">{s.id}</h3>
                  <div className="row">
                    {s.demo && <span className="pill demo">演示</span>}
                    {s.comparability === 'degraded' && <span className="pill bad">可比性降级</span>}
                    <span className={pill.cls}>{pill.text}</span>
                  </div>
                </div>
                <div className="muted" style={{ margin: '6px 0' }}>{s.task.length > 90 ? `${s.task.slice(0, 90)}…` : s.task}</div>
                <div className="row" style={{ gap: 16 }}>
                  <span className="muted mono">{s.repoPath}</span>
                  <span className="muted">·</span>
                  <span className="muted">{s.laneCount} 赛道</span>
                  <span className="muted">·</span>
                  <span className="muted">{fmtDate(s.createdAt)}</span>
                  {verdictText && <><span className="muted">·</span><span className="muted" style={{ color: '#fbbf24' }}>{verdictText}</span></>}
                </div>
              </button>
            )
          })}
        </section>
      )}
      <div className="row between" style={{ marginTop: 18 }}>
        <button className="ghost" onClick={() => void props.onReload()}>刷新</button>
        <button className="primary" onClick={props.onCreate}>＋ 新比赛</button>
      </div>
    </div>
  )
}
