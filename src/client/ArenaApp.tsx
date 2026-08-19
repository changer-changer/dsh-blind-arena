import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ArenaExperiment, ExperimentSummary } from '../types.ts'
import { ARENA_HERO_ART } from './generated/art.ts'
import { ArenaClient, ArenaRpcError } from './rpc.ts'
import { ListView } from './views/ListView.tsx'
import { CreateView } from './views/CreateView.tsx'
import { RaceView } from './views/RaceView.tsx'
import { ReviewView } from './views/ReviewView.tsx'
import { RevealView } from './views/RevealView.tsx'

export type Route =
  | { kind: 'list' }
  | { kind: 'create'; repoPath?: string }
  | { kind: 'experiment'; id: string }

export interface Toast {
  id: number
  text: string
  error?: boolean
}

let clientSingleton: ArenaClient | undefined

export function arenaClient(): ArenaClient {
  if (!clientSingleton) throw new Error('dsh-blind-arena: client not initialized')
  return clientSingleton
}

/** Polling hook: live experiment state with quiet-fallback. */
export function useExperiment(id: string | undefined, active: boolean): {
  exp: ArenaExperiment | undefined
  refresh: () => void
  error: string | undefined
} {
  const [exp, setExp] = useState<ArenaExperiment>()
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const versionRef = useRef(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const since = versionRef.current
        const result = await arenaClient().changesSince(id, since)
        if (cancelled) return
        if (typeof result === 'number') {
          versionRef.current = result
          return
        }
        versionRef.current = Date.now()
        setExp(result)
        setError(undefined)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof ArenaRpcError ? e.message : String(e))
      }
    }
    void load()
    if (!active) return
    const interval = setInterval(load, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [id, active, tick])

  return { exp, refresh, error }
}

export function ArenaApp(props: { preview?: boolean; clientCtx?: ClientContext }): JSX.Element {
  const [open, setOpen] = useState(props.preview === true)
  const [route, setRoute] = useState<Route>({ kind: 'list' })
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const [summaries, setSummaries] = useState<readonly ExperimentSummary[]>()
  const toastSeq = useRef(0)

  useEffect(() => {
    if (clientSingleton || !props.clientCtx) return
    clientSingleton = new ArenaClient(props.clientCtx)
  }, [props.clientCtx])

  // Initialize the shared client lazily against the global cordis context.
  useEffect(() => {
    if (clientSingleton) return
    const globalCtx = (globalThis as { __dshArenaClientContext?: ClientContext }).__dshArenaClientContext
    if (globalCtx) clientSingleton = new ArenaClient(globalCtx)
  }, [])

  const toast = useCallback((text: string, error = false): void => {
    const id = (toastSeq.current += 1)
    setToasts((prev) => [...prev.slice(-3), { id, text, error }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600)
  }, [])

  const reloadList = useCallback(async (): Promise<void> => {
    try {
      setSummaries(await arenaClient().list())
    } catch (e) {
      toast(e instanceof ArenaRpcError ? e.message : String(e), true)
    }
  }, [toast])

  useEffect(() => {
    if (open && route.kind === 'list') void reloadList()
  }, [open, route, reloadList])

  const navigate = useCallback((next: Route): void => {
    setRoute(next)
  }, [])

  const running = route.kind === 'experiment'
  const crumb = useMemo(() => {
    if (route.kind === 'list') return '实验'
    if (route.kind === 'create') return '新建比赛'
    const item = summaries?.find((s) => s.id === route.id)
    return item ? item.task.slice(0, 24) : route.id
  }, [route, summaries])

  if (!open) {
    return (
      <div className="interactive ar-launcher" onClick={() => setOpen(true)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}>
        <span className="logo">🏟️</span> Arena
      </div>
    )
  }

  return (
    <div className="ar-root">
      <div className="ar-panel">
        <header className="ar-topbar">
          <div className="brand"><span className="mark">✦</span><span><strong>DSH Blind Arena</strong><small>先盲评 · 后揭晓</small></span></div>
          <div className="crumb">/ {crumb}{running ? '' : ''}</div>
          <div className="spacer" />
          <button className="ghost small" onClick={() => { navigate({ kind: 'list' }); void reloadList() }}>实验列表</button>
          <button className="primary small" onClick={() => navigate({ kind: 'create' })}>＋ 新比赛</button>
          <button className="ar-close" aria-label="收起 Arena" onClick={() => setOpen(false)}>✕</button>
        </header>
        <div className="ar-body">
          <div className="ar-wrap">
            {route.kind === 'list' && (
              <ListView summaries={summaries} onOpen={(id) => navigate({ kind: 'experiment', id })}
                onCreate={() => navigate({ kind: 'create' })} onReload={reloadList} heroArt={ARENA_HERO_ART} />
            )}
            {route.kind === 'create' && (
              <CreateView onCreated={(id) => { toast('比赛已创建'); navigate({ kind: 'experiment', id }) }} onCancel={() => navigate({ kind: 'list' })} toast={toast} />
            )}
            {route.kind === 'experiment' && (
              <ExperimentRouter id={route.id} toast={toast} onExit={() => { navigate({ kind: 'list' }); void reloadList() }} />
            )}
          </div>
        </div>
      </div>
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' err' : ''}`}>{t.text}</div>
        ))}
      </div>
    </div>
  )
}

function ExperimentRouter(props: { id: string; toast: (t: string, e?: boolean) => void; onExit: () => void }): JSX.Element | null {
  const { exp } = useExperiment(props.id, true)
  if (!exp) return <div className="empty"><div className="big">⏳</div>载入实验…</div>
  if (exp.phase === 'running') {
    return <RaceView exp={exp} toast={props.toast} />
  }
  if (exp.phase === 'review') {
    return <ReviewView exp={exp} refresh={() => undefined} toast={props.toast} onExit={props.onExit} />
  }
  return <RevealView exp={exp} toast={props.toast} onExit={props.onExit} />
}
