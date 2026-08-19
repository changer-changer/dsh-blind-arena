/**
 * DSH Arena host plugin.
 *
 * Host surface: one cordis Service (`arena`) exposed over the shared `/api`
 * channel through the Typert Gateway's SRC discovery — the class extends
 * TypertRemoteService and its business methods are marked with Remote(); the
 * gateway reads parameter names from the shipped (unminified) source, so wire
 * args are `{ args: { paramName: value } }`.
 *
 * Anonymity: every experiment served before reveal is passed through
 * `redactExperiment` — identities never cross the wire until the user asks.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ArenaCatalog,
  ArenaExperiment,
  ArenaVerdict,
  CatalogProvider,
  CleanupResult,
  CreateExperimentInput,
  ExperimentSummary,
  ExportResult,
  ModelInfoResult,
  PreflightResult,
  RpcOk,
  BranchResult,
} from './types.ts'
import { fileStore, redactExperiment, revealedExperiment } from './store.ts'
import { ArenaEngine } from './engine.ts'
import { preflight as gitPreflight } from './git.ts'
import { exportReport } from './export.ts'
import { arenaHome } from './util.ts'

/**
 * Mark one method as a Remote endpoint.
 *
 * tsdown does not emit TC39 decorator metadata, so this reproduces exactly
 * what the compiled DSH services do: build the decorator via the exported
 * `Remote(name)` factory and invoke it with a hand-built method-decorator
 * context whose addInitializer registers the marker on the prototype.
 */
function remote<Class extends object>(service: Class, method: keyof Class & string, exportName?: string): void {
  const decorator = Remote(exportName ?? method) as unknown as (
    method: undefined,
    context: {
      kind: 'method'
      name: string
      static: boolean
      private: boolean
      access: { has: (o: object) => boolean; get: (o: object) => unknown }
      addInitializer: (fn: () => void) => void
      metadata?: unknown
    },
  ) => void
  const initializers: (() => void)[] = []
  decorator(undefined, {
    kind: 'method',
    name: method,
    static: false,
    private: false,
    access: { has: (o: object) => method in o, get: (o: object) => (o as Record<string, unknown>)[method] },
    addInitializer(fn) {
      initializers.push(fn)
    },
  })
  for (const init of initializers) init.call(service)
}

class ArenaService extends TypertRemoteService {
  private readonly engine: ArenaEngine
  private readonly store = fileStore()
  /** Poll listeners registered by the client (id → last version sent). */
  private readonly pollVersion = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'arena')
    this.engine = new ArenaEngine(ctx, this.store, {
      onExperimentUpdate: () => {
        this.pollVersion.forEach((_, id) => this.pollVersion.set(id, Date.now()))
      },
    })
    // Manual Remote markers (no decorator transpile in tsdown output).
    remote(this, 'list')
    remote(this, 'get')
    remote(this, 'catalog')
    remote(this, 'modelInfo')
    remote(this, 'preflight')
    remote(this, 'create')
    remote(this, 'cancel')
    remote(this, 'verdict')
    remote(this, 'reveal')
    remote(this, 'diff')
    remote(this, 'export')
    remote(this, 'createWinnerBranch')
    remote(this, 'cleanup')
    remote(this, 'changesSince')
  }

  async list(): Promise<RpcOk<readonly ExperimentSummary[]>> {
    return { ok: true, value: await this.store.list() }
  }

  async get(id: string): Promise<RpcOk<ArenaExperiment> | { ok: false; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: `实验 ${id} 不存在` }
    const { exp, secrets } = loaded
    // The reveal state is authoritative: pre-reveal views are scrubbed even
    // if a secrets file merge raced.
    const view = exp.phase === 'revealed' ? revealedExperiment(exp, secrets) : redactExperiment(exp)
    return { ok: true, value: view }
  }

  async changesSince(id: string, since: number): Promise<RpcOk<number | ArenaExperiment>> {
    const version = this.pollVersion.get(id) ?? 0
    if (version <= since) return { ok: true, value: version }
    const result = await this.get(id)
    return result.ok ? { ok: true, value: result.value } : result
  }

  async catalog(): Promise<ArenaCatalog> {
    const llm = this.ctx.get('llm')
    if (!llm) return { providers: [] }
    const providers: CatalogProvider[] = []
    try {
      const list = llm.listProviders() as readonly { id: string; name?: string }[]
      for (const info of list) {
        let models: { id: string; name?: string }[] = []
        try {
          models = (await llm.listModels(info.id)) as { id: string; name?: string }[]
        } catch {
          models = []
        }
        providers.push({ provider: info.id, models: models.map((m) => ({ id: m.id, name: m.name })) })
      }
    } catch {
      /* catalog is advisory */
    }
    let defaultSelection: ArenaCatalog['defaultSelection']
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults) {
      try {
        const sel = defaults.currentSelection() as { provider: string; model: string; reasoningEffort?: string }
        defaultSelection = { provider: sel.provider, model: sel.model, reasoningEffort: sel.reasoningEffort }
      } catch {
        defaultSelection = undefined
      }
    }
    return { providers, defaultSelection }
  }

  async modelInfo(provider: string, model: string): Promise<ModelInfoResult> {
    const llm = this.ctx.get('llm')
    if (!llm) return { ok: false, message: 'llm runtime unavailable' }
    try {
      const info = (await llm.resolveModelInfo(provider, model)) as {
        context?: number
        defaultMaxTokens?: number
        reasoning?: { efforts?: readonly string[]; defaultEffort?: string }
      }
      return {
        ok: true,
        context: info.context,
        defaultMaxTokens: info.defaultMaxTokens,
        reasoning: info.reasoning
          ? { efforts: [...(info.reasoning.efforts ?? [])], defaultEffort: info.reasoning.defaultEffort }
          : undefined,
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  async preflight(path: string): Promise<PreflightResult> {
    return gitPreflight(path)
  }

  async create(input: CreateExperimentInput): Promise<RpcOk<ArenaExperiment> | { ok: false; message: string }> {
    const created = await this.engine.create(input)
    if (!created.ok) return created
    this.pollVersion.set(created.value.id, Date.now())
    return { ok: true, value: redactExperiment(created.value) }
  }

  async cancel(id: string): Promise<RpcOk<{ ok: boolean; message: string }>> {
    const result = await this.engine.cancel(id)
    this.pollVersion.set(id, Date.now())
    return { ok: true, value: result }
  }

  async verdict(id: string, verdict: ArenaVerdict): Promise<RpcOk<ArenaExperiment> | { ok: false; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: `实验 ${id} 不存在` }
    if (loaded.exp.phase !== 'review') return { ok: false, message: '只有评审阶段的比赛可以保存判断' }
    const exp: ArenaExperiment = { ...loaded.exp, verdict }
    await this.store.save(exp, loaded.secrets)
    this.pollVersion.set(id, Date.now())
    return { ok: true, value: redactExperiment(exp) }
  }

  async reveal(id: string): Promise<RpcOk<ArenaExperiment> | { ok: false; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: `实验 ${id} 不存在` }
    if (loaded.exp.phase === 'revealed') {
      return { ok: true, value: revealedExperiment(loaded.exp, loaded.secrets) }
    }
    const incomplete = loaded.exp.lanes.some((lane) => !['done', 'failed', 'timeout', 'cancelled', 'blocked'].includes(lane.status))
    if (incomplete) return { ok: false, message: '仍有赛道未进入终态,不能揭晓' }
    const exp: ArenaExperiment = { ...loaded.exp, phase: 'revealed', revealedAt: Date.now() }
    await this.store.save(exp, loaded.secrets)
    this.pollVersion.set(id, Date.now())
    return { ok: true, value: revealedExperiment(exp, loaded.secrets) }
  }

  async diff(id: string, label: string): Promise<RpcOk<string>> {
    const { LANE_LABELS } = await import('./types.ts')
    if (!LANE_LABELS.includes(label as (typeof LANE_LABELS)[number])) {
      return { ok: false, message: `非法赛道标签 ${label}` }
    }
    return { ok: true, value: await this.store.readDiff(id, label as (typeof LANE_LABELS)[number]) }
  }

  async export(id: string, includeDiff: boolean): Promise<RpcOk<ExportResult> | { ok: false; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: `实验 ${id} 不存在` }
    const view = loaded.exp.phase === 'revealed' ? revealedExperiment(loaded.exp, loaded.secrets) : loaded.exp
    const diffs: { label: string; patch: string }[] = []
    if (includeDiff) {
      for (const lane of loaded.exp.lanes) {
        diffs.push({ label: lane.label, patch: await this.store.readDiff(id, lane.label) })
      }
    }
    try {
      const result = await exportReport(view, includeDiff, diffs)
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  async createWinnerBranch(id: string, label: string): Promise<RpcOk<BranchResult> | { ok: false; message: string }> {
    const loaded = await this.store.load(id)
    if (!loaded) return { ok: false, message: `实验 ${id} 不存在` }
    const { createWinnerBranch } = await import('./export.ts')
    return createWinnerBranch(loaded.exp, label)
  }

  async cleanup(id: string, keep: readonly string[]): Promise<RpcOk<CleanupResult> | { ok: false; message: string }> {
    const { LANE_LABELS } = await import('./types.ts')
    const keepLabels = keep.filter((k): k is (typeof LANE_LABELS)[number] => LANE_LABELS.includes(k as (typeof LANE_LABELS)[number]))
    const result = await this.engine.cleanup(id, keepLabels)
    if (!result.ok) return { ok: false, message: result.message }
    return { ok: true, value: { removed: [], kept: [] } }
  }
}

export const name = 'arena'

export const inject = ['connection', 'llm', 'agentDefaultModel']

export function apply(ctx: Context): void {
  // Ensure the arena home exists at boot so early UI reads never 500.
  void mkdir(arenaHome(), { recursive: true }).catch(() => undefined)
  new ArenaService(ctx)
}
