/**
 * Client-side RPC bridge.
 *
 * Wire contract (dsh-api-gateway over the shared /api channel):
 *   call('/api', '<namespace>/<method>', { args: { <paramName>: value } })
 *   → { ok: true, value } | { ok: false, error: { code, message } }
 *
 * SRC-mode dispatch reads parameter names from the shipped host source, so
 * parameter names on the wire must match the host method signatures exactly.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ArenaCatalog,
  ArenaExperiment,
  ArenaVerdict,
  CleanupResult,
  CreateExperimentInput,
  ExperimentSummary,
  ExportResult,
  ModelInfoResult,
  PreflightResult,
  RpcOk,
} from '../types.ts'

type WireResult<T> = { ok: true; value: T } | { ok: false; error: { code?: string; message?: string } }

export class ArenaRpcError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'ArenaRpcError'
  }
}

export class ArenaClient {
  constructor(private readonly ctx: ClientContext) {}

  private async call<T>(method: string, args: Record<string, unknown>): Promise<T> {
    const connection = this.ctx.get('connection')
    if (!connection) throw new ArenaRpcError('dsh-blind-arena: connection service unavailable')
    const result = (await connection.rpc.call('/api', `arena/${method}`, { args })) as WireResult<T>
    if (result.ok) return result.value
    throw new ArenaRpcError(result.error?.message ?? `arena/${method} failed`, result.error?.code)
  }

  list(): Promise<readonly ExperimentSummary[]> {
    return this.call<readonly ExperimentSummary[]>('list', {})
  }

  get(id: string): Promise<ArenaExperiment> {
    return this.call<ArenaExperiment>('get', { id })
  }

  changesSince(id: string, since: number): Promise<number | ArenaExperiment> {
    return this.call<number | ArenaExperiment>('changesSince', { id, since })
  }

  catalog(): Promise<ArenaCatalog> {
    return this.call<ArenaCatalog>('catalog', {})
  }

  modelInfo(provider: string, model: string): Promise<ModelInfoResult> {
    return this.call<ModelInfoResult>('modelInfo', { provider, model })
  }

  preflight(path: string): Promise<PreflightResult> {
    return this.call<PreflightResult>('preflight', { path })
  }

  async create(input: CreateExperimentInput): Promise<ArenaExperiment> {
    const result = await this.call<RpcOk<ArenaExperiment>>('create', { input })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value
  }

  async cancel(id: string): Promise<string> {
    const result = await this.call<RpcOk<{ ok: boolean; message: string }>>('cancel', { id })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value.message
  }

  async verdict(id: string, verdict: ArenaVerdict): Promise<ArenaExperiment> {
    const result = await this.call<RpcOk<ArenaExperiment>>('verdict', { id, verdict })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value
  }

  async reveal(id: string): Promise<ArenaExperiment> {
    const result = await this.call<RpcOk<ArenaExperiment>>('reveal', { id })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value
  }

  diff(id: string, label: string): Promise<string> {
    return this.call<string>('diff', { id, label })
  }

  async export(id: string, includeDiff: boolean): Promise<ExportResult> {
    const result = await this.call<RpcOk<ExportResult>>('export', { id, includeDiff })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value
  }

  async createWinnerBranch(id: string, label: string): Promise<string> {
    const result = await this.call<RpcOk<{ branch: string; commit: string }>>('createWinnerBranch', { id, label })
    if (!result.ok) throw new ArenaRpcError(result.message)
    return result.value.branch
  }

  async cleanup(id: string, keep: readonly string[]): Promise<string> {
    await this.call<RpcOk<CleanupResult>>('cleanup', { id, keep })
    return 'done'
  }
}
