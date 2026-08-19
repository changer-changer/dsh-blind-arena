/**
 * DSH Arena — public domain vocabulary.
 *
 * Every type that crosses the wire is plain JSON. The anonymity contract is
 * structural: `ArenaExperiment` (the public record) contains NO participant
 * identity; identities live in a separate server-side secrets file and are
 * merged into the wire view only after the user reveals.
 */

export const LANE_LABELS = ['A', 'B', 'C', 'D'] as const
export type LaneLabel = (typeof LANE_LABELS)[number]

export const MIN_LANES = 2
export const MAX_LANES = 4

/** What one contestant runs with. Server-side secret until reveal. */
export interface ParticipantSpec {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  /** Post-reveal display label, e.g. `openai / gpt-5 (high)`. */
  readonly label: string
}

export type LaneStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'blocked'

/** Whether a lane reached a terminal state. */
export function laneTerminal(status: LaneStatus): boolean {
  return (
    status === 'done' || status === 'failed' || status === 'timeout' ||
    status === 'cancelled' || status === 'blocked'
  )
}

/** One sanitized activity-feed entry (server-built; never raw model output). */
export interface LaneFeedItem {
  readonly t: number
  readonly k: 'tool' | 'msg' | 'turn' | 'sys'
  /** tool name / short system text / turn reason */
  readonly text: string
  readonly ok?: boolean
}

export interface TokenUsageView {
  readonly source: 'provider' | 'unknown'
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export interface ChangedFile {
  readonly path: string
  readonly additions: number
  readonly deletions: number
}

export interface VerificationRun {
  readonly command: string
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly durationMs: number
  readonly stdoutTail: string
  readonly stderrTail: string
  /** True when Arena failed to spawn the command itself (not a test failure). */
  readonly spawnError?: string
  readonly skipped?: boolean
}

export const VERIFICATION_TIMEOUT_MS = 10 * 60_000

/** A lane's public state (identity-free). */
export interface ArenaLane {
  readonly label: LaneLabel
  readonly status: LaneStatus
  readonly worktreePath: string
  readonly startedAt?: number
  readonly endedAt?: number
  readonly durationMs?: number
  readonly feed: readonly LaneFeedItem[]
  readonly tokens?: TokenUsageView
  readonly finalAnswer?: string
  readonly answerChars?: number
  readonly changedFiles?: readonly ChangedFile[]
  readonly changedFilesCount?: number
  readonly additions?: number
  readonly deletions?: number
  readonly diffBytes?: number
  readonly verification?: readonly VerificationRun[]
  /** True when every executed verification command exited 0. */
  readonly passed?: boolean
  readonly error?: string
  /** Present only after reveal. */
  readonly identity?: ParticipantSpec
  /** Present only after reveal — the durable DSH session behind the lane. */
  readonly agentSessionId?: string
}

export type ExperimentPhase = 'running' | 'review' | 'revealed'

export type VerdictKind = 'winner' | 'ranking' | 'tie' | 'all-fail' | 'skipped'

export interface ArenaVerdict {
  readonly kind: VerdictKind
  readonly winner?: LaneLabel
  readonly ranking?: readonly LaneLabel[]
  readonly note?: string
  readonly savedAt: number
  readonly skippedReason?: string
}

/** The public experiment record persisted at ~/.dsh/arena/<id>/experiment.json. */
export interface ArenaExperiment {
  readonly id: string
  readonly createdAt: number
  readonly demo: boolean
  readonly repoPath: string
  readonly repoBranch?: string
  readonly baselineCommit: string
  readonly baselineClean: boolean
  readonly task: string
  readonly verifyCommands: readonly string[]
  readonly timeoutMs: number
  readonly phase: ExperimentPhase
  readonly lanes: readonly ArenaLane[]
  readonly verdict?: ArenaVerdict
  readonly revealedAt?: number
  /** Fairness notes: anything that made lanes non-comparable. */
  readonly deviations: readonly string[]
  /** User-visible remark when the experiment should not be compared as-is. */
  readonly comparability: 'ok' | 'degraded'
}

/** Server-side secret file: label → identity. Never serialized to the client pre-reveal. */
export interface ArenaSecrets {
  readonly identities: Readonly<Record<LaneLabel, ParticipantSpec>>
  readonly agentSessions: Record<LaneLabel, string>
}

/** Wire view of one experiment summary for the list page. */
export interface ExperimentSummary {
  readonly id: string
  readonly createdAt: number
  readonly demo: boolean
  readonly task: string
  readonly repoPath: string
  readonly laneCount: number
  readonly phase: ExperimentPhase
  readonly verdict?: ArenaVerdict
  readonly revealedAt?: number
  readonly comparability: 'ok' | 'degraded'
}

export interface PreflightResult {
  readonly ok: boolean
  readonly repoPath?: string
  readonly head?: string
  readonly branch?: string
  readonly clean?: boolean
  readonly dirtyEntries?: readonly string[]
  readonly message?: string
  readonly suggestedCommands: readonly string[]
}

export interface CatalogModel {
  readonly id: string
  readonly name?: string
}

export interface CatalogProvider {
  readonly provider: string
  readonly models: readonly CatalogModel[]
}

export interface ArenaCatalog {
  readonly providers: readonly CatalogProvider[]
  readonly defaultSelection?: { provider: string; model: string; reasoningEffort?: string }
}

export interface ModelInfoResult {
  readonly ok: boolean
  readonly message?: string
  readonly context?: number
  readonly defaultMaxTokens?: number
  readonly reasoning?: { readonly efforts: readonly string[]; readonly defaultEffort?: string }
}

export interface CreateParticipantInput {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export interface CreateExperimentInput {
  readonly repoPath: string
  readonly task: string
  readonly verifyCommands: readonly string[]
  readonly timeoutMinutes: number
  readonly participants: readonly CreateParticipantInput[]
  readonly demo?: boolean
}

/** Expected failures ride the value channel: { ok:false, message } unions. */
export type RpcOk<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

export interface ExportResult {
  readonly path: string
  readonly bytes: number
}

export interface BranchResult {
  readonly branch: string
  readonly commit: string
}

export interface CleanupResult {
  readonly removed: readonly string[]
  readonly kept: readonly string[]
}
