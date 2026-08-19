import { useEffect, useMemo, useState } from 'react'
import type { ArenaCatalog, CreateExperimentInput, PreflightResult } from '../../types.ts'
import { arenaClient } from '../ArenaApp.tsx'

interface ParticipantDraft {
  provider: string
  model: string
  reasoningEffort: string
}

const DEFAULT_VERIFY = 'npm test'
const MINUTES_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

export function CreateView(props: {
  onCreated: (id: string) => void
  onCancel: () => void
  toast: (text: string, error?: boolean) => void
}): JSX.Element {
  const [catalog, setCatalog] = useState<ArenaCatalog>()
  const [repoPath, setRepoPath] = useState('')
  const [task, setTask] = useState('')
  const [verify, setVerify] = useState(DEFAULT_VERIFY)
  const [minutes, setMinutes] = useState(15)
  const [participants, setParticipants] = useState<ParticipantDraft[]>([])
  const [preflight, setPreflight] = useState<PreflightResult>()
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void arenaClient().catalog().then((c) => {
      setCatalog(c)
      const seed: ParticipantDraft[] = []
      const providerA = c.defaultSelection?.provider ?? c.providers[0]?.provider ?? ''
      const modelA = c.defaultSelection?.model ?? c.providers[0]?.models[0]?.id ?? ''
      if (providerA && modelA) {
        seed.push({ provider: providerA, model: modelA, reasoningEffort: c.defaultSelection?.reasoningEffort ?? '' })
      }
      if (c.providers.length > 0) {
        const second = c.providers.find((p) => p.provider !== providerA) ?? c.providers[0]
        const secondModel = second.models.find((m) => m.id !== modelA)?.id ?? second.models[0]?.id ?? ''
        if (secondModel) seed.push({ provider: second.provider, model: secondModel, reasoningEffort: '' })
      }
      setParticipants(seed.length >= 2 ? seed.slice(0, 2) : seed)
    }).catch((e: unknown) => props.toast(String(e), true))
  }, [])

  const runPreflight = async (): Promise<void> => {
    if (!repoPath.trim()) {
      props.toast('请先填写仓库路径', true)
      return
    }
    setChecking(true)
    try {
      const result = await arenaClient().preflight(repoPath.trim())
      setPreflight(result)
    } catch (e) {
      props.toast(String(e), true)
    } finally {
      setChecking(false)
    }
  }

  const setParticipant = (i: number, patch: Partial<ParticipantDraft>): void => {
    setParticipants((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  const addParticipant = (): void => {
    if (participants.length >= 4) return
    const p = catalog?.providers[0]
    setParticipants((prev) => [...prev, { provider: p?.provider ?? '', model: p?.models[0]?.id ?? '', reasoningEffort: '' }])
  }

  const removeParticipant = (i: number): void => {
    setParticipants((prev) => prev.filter((_, idx) => idx !== i))
  }

  const canSubmit = useMemo(() => (
    preflight?.ok === true &&
    preflight.clean === true &&
    task.trim() !== '' &&
    verify.trim() !== '' &&
    participants.length >= 2 &&
    participants.every((p) => p.provider !== '' && p.model !== '')
  ), [preflight, task, verify, participants])

  const submit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      const input: CreateExperimentInput = {
        repoPath: preflight!.repoPath!,
        task: task.trim(),
        verifyCommands: verify.split('\n').map((l) => l.trim()).filter((l) => l !== ''),
        timeoutMinutes: minutes,
        participants: participants.map((p) => ({
          provider: p.provider,
          model: p.model,
          reasoningEffort: p.reasoningEffort || undefined,
        })),
      }
      const exp = await arenaClient().create(input)
      props.onCreated(exp.id)
    } catch (e) {
      props.toast(e instanceof Error ? e.message : String(e), true)
    } finally {
      setSubmitting(false)
    }
  }

  const submitDemo = async (): Promise<void> => {
    if (!preflight?.ok || !preflight.repoPath) {
      props.toast('演示也需要一个真实 Git 仓库作为基线', true)
      return
    }
    setSubmitting(true)
    try {
      const exp = await arenaClient().create({
        repoPath: preflight.repoPath,
        task: '演示任务:为 stats 模块补齐边界处理并保持测试通过',
        verifyCommands: verify.split('\n').map((l) => l.trim()).filter((l) => l !== ''),
        timeoutMinutes: minutes,
        participants: [
          { provider: 'demo-a', model: 'demo-focused' },
          { provider: 'demo-b', model: 'demo-verbose' },
        ],
        demo: true,
      })
      props.onCreated(exp.id)
    } catch (e) {
      props.toast(e instanceof Error ? e.message : String(e), true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h3>① 仓库与基线</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Git 仓库路径(绝对路径)</label>
            <input value={repoPath} placeholder="/home/you/projects/my-repo" onChange={(e) => { setRepoPath(e.target.value); setPreflight(undefined) }} />
            <div className="hint">比赛不修改该目录;所有改动发生在 Arena 自建的隔离 worktree 中</div>
          </div>
          <button className="ghost" disabled={checking} onClick={() => void runPreflight()}>
            {checking ? <><span className="spinner" /> 检查中…</> : '预检仓库'}
          </button>
          {preflight && (
            <div style={{ marginTop: 12 }}>
              {preflight.ok ? (
                <div className="callout">
                  <div>✓ {preflight.repoPath}</div>
                  <div className="mono muted">{preflight.branch ?? 'detached'} @ {preflight.head?.slice(0, 10)}</div>
                  {preflight.clean
                    ? <div style={{ color: '#6ee7b7' }}>工作区干净 — 所有参赛者将从同一 commit 出发</div>
                    : <div style={{ color: '#fca5a5' }}>工作区不干净({preflight.dirtyEntries?.length ?? 0} 处改动)。请先提交或 stash,否则无法开赛。</div>}
                </div>
              ) : (
                <div className="callout warn">✗ {preflight.message}</div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3>② 任务与验证</h3>
          <div className="field" style={{ marginTop: 10 }}>
            <label>任务描述(所有参赛者收到逐字相同的输入)</label>
            <textarea value={task} placeholder="例如:修复 median() 在空数组时返回 NaN 的问题,补上测试,保持其他行为不变" onChange={(e) => setTask(e.target.value)} />
          </div>
          <div className="field">
            <label>验证命令(每行一条,在每条赛道内执行)</label>
            <textarea style={{ minHeight: 64, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={verify} onChange={(e) => setVerify(e.target.value)} />
            <div className="hint">所有赛道执行相同命令 — 这是公平比较的基础</div>
          </div>
          <div className="field">
            <label>每条赛道时间上限</label>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {MINUTES_OPTIONS.map((m) => <option key={m} value={m}>{m} 分钟</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3>③ 参赛者(2~4,开赛后随机分配匿名赛道)</h3>
          <button className="ghost small" disabled={participants.length >= 4} onClick={addParticipant}>＋ 添加</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {participants.length === 0 && <div className="muted">未检测到可用模型 provider — 请先在 DSH 设置中配置模型。</div>}
          {participants.map((p, i) => {
            const provider = catalog?.providers.find((x) => x.provider === p.provider)
            return (
              <div key={i} className="participant-row">
                <select value={p.provider} onChange={(e) => setParticipant(i, { provider: e.target.value, model: '', reasoningEffort: '' })}>
                  {catalog?.providers.map((x) => <option key={x.provider} value={x.provider}>{x.provider}</option>)}
                </select>
                <select value={p.model} onChange={(e) => setParticipant(i, { model: e.target.value, reasoningEffort: '' })}>
                  <option value="">选择模型…</option>
                  {provider?.models.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
                </select>
                <select value={p.reasoningEffort} onChange={(e) => setParticipant(i, { reasoningEffort: e.target.value })}>
                  <option value="">默认推理强度</option>
                  {['low', 'medium', 'high'].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <button className="remove-p" disabled={participants.length <= 2} onClick={() => removeParticipant(i)} aria-label="移除参赛者">✕</button>
              </div>
            )
          })}
        </div>
        <div className="callout" style={{ marginTop: 12 }}>
          开赛时 Arena 会把参赛者随机映射到匿名赛道 A/B/C/D,并打乱标签,避免位置偏见。揭晓前任何界面、数据、日志都不会出现模型身份。
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="muted">
            {participants.length} 名参赛者 · {minutes} 分钟上限 · {verify.split('\n').filter((l) => l.trim() !== '').length} 条验证命令
          </div>
          <div className="row">
            <button className="ghost" onClick={props.onCancel}>取消</button>
            <button className="ghost" disabled={!preflight?.ok || submitting} onClick={() => void submitDemo()}>看演示(无 API 消耗)</button>
            <button className="primary" disabled={!canSubmit || submitting} onClick={() => void submit()}>
              {submitting ? <><span className="spinner" /> 创建中…</> : '🏁 开始比赛'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
