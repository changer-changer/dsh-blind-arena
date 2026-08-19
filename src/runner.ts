/**
 * One arena lane: a real DSH agent rooted in an isolated git worktree.
 *
 * The drive sequence mirrors the canonical headless runner:
 *   agents.create({ sessionId, meta.cwd = worktree, agentOptions, setup })
 *   → await agent.whenIdle()
 *   → firstSeq = session.seq
 *   → agent.followup(createUserMessage(task))
 *   → await agent.whenIdle() (bounded by timeout / cancellation)
 *   → sessions.flush(session)
 *   → summarize events from firstSeq
 */
import { installModelSelection, foldConsumedWork } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type { LaneFeedItem, TokenUsageView } from './types.ts'
import { newSessionId } from './util.ts'

export interface LaneRunnerInput {
  readonly ctx: Context
  readonly task: string
  readonly worktree: string
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  readonly timeoutMs: number
}

export interface LaneRunResult {
  readonly ok: boolean
  readonly status: 'done' | 'timeout' | 'cancelled' | 'failed' | 'blocked'
  readonly finalAnswer: string
  readonly feed: readonly LaneFeedItem[]
  readonly tokens: TokenUsageView
  readonly sessionId: string
  readonly error?: string
}

const FEED_LIMIT = 400
const ANSWER_LIMIT = 60_000

/** Extract plain text from assistant message content blocks. */
function assistantText(message: { content: readonly { type: string; text?: string }[] }): string {
  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text!)
    .join('')
}

interface UsageLike {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

interface UsageDelta {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  sawProvider: boolean
}

function accumulateUsage(acc: UsageDelta, usage: UsageLike | undefined): void {
  if (!usage) return
  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheWrite = usage.cacheWriteTokens ?? 0
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) return
  acc.input += input
  acc.output += output
  acc.cacheRead += cacheRead
  acc.cacheWrite += cacheWrite
  acc.sawProvider = true
}

function summarizeUsage(acc: UsageDelta): TokenUsageView {
  return {
    source: acc.sawProvider ? 'provider' : 'unknown',
    input: acc.input,
    output: acc.output,
    cacheRead: acc.cacheRead,
    cacheWrite: acc.cacheWrite,
  }
}

/** Run one lane to a terminal state. Never rejects: failures become { ok:false }. */
export async function runLane(input: LaneRunnerInput): Promise<LaneRunResult> {
  const { ctx, task, worktree, provider, model, reasoningEffort, timeoutMs } = input
  const feed: LaneFeedItem[] = []
  const usage: UsageDelta = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, sawProvider: false }
  let finalAnswer = ''
  let turnEnded = false

  const pushFeed = (item: LaneFeedItem): void => {
    if (feed.length < FEED_LIMIT) feed.push(item)
  }

  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  if (!agents || !sessions) {
    return {
      ok: false,
      status: 'failed',
      finalAnswer: '',
      feed,
      tokens: summarizeUsage(usage),
      sessionId: '',
      error: 'dsh-blind-arena: agent runtime is not available in this host',
    }
  }

  let handle: AgentHandle | undefined
  const abort = new AbortController()
  let timedOut = false
  let cancelled = false

  const timer = setTimeout(() => {
    timedOut = true
    abort.abort()
    try {
      handle?.agent.cancel({ kind: 'hook', reason: 'dsh-blind-arena: lane timeout' })
    } catch {
      /* agent already gone */
    }
  }, timeoutMs)

  abort.signal.addEventListener('abort', () => {
    if (!timedOut) cancelled = true
  })

  const sessionId = newSessionId()

  try {
    handle = await agents.create({
      sessionId: SessionId(sessionId),
      meta: { cwd: worktree },
      agentOptions: { provider, model },
      signal: abort.signal,
      setup: (agentCtx: Context) => {
        installModelSelection(agentCtx, {
          current: { provider, model, reasoningEffort: reasoningEffort === undefined ? undefined : ReasoningEffortId(reasoningEffort) },
          assembled: undefined,
        })
        agentCtx.on('session/event', (_session: Session, event: SessionEvent) => {
          if (event.type === 'tool/call') {
            pushFeed({ t: Date.now(), k: 'tool', text: String(event.data?.name ?? 'tool') })
          } else if (event.type === 'tool/result') {
            const ok = event.data?.error === undefined || event.data?.error === null
            pushFeed({ t: Date.now(), k: 'tool', text: `→ ${ok ? 'ok' : 'error'}`, ok })
          } else if (event.type === 'assistant/message') {
            const text = assistantText(event.data?.message ?? { content: [] })
            if (text.trim() !== '') {
              finalAnswer = text
              pushFeed({ t: Date.now(), k: 'msg', text: 'answer text' })
            }
            accumulateUsage(usage, event.data?.usage)
          } else if (event.type === 'turn/end') {
            turnEnded = true
            pushFeed({
              t: Date.now(),
              k: 'turn',
              text: `turn ${String(event.data?.reason?.kind ?? 'end')}`,
            })
          }
        })
      },
    })

    const agent: Agent = handle.agent
    await agent.whenIdle()

    const firstSeq = agent.session.seq
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: task }],
        source: { kind: 'user' },
      }),
    )
    await agent.whenIdle()
    try {
      await sessions.flush(agent.session)
    } catch {
      /* persistence is best-effort for arena reporting */
    }

    // Fold the owned interval for the definitive outcome.
    const events: readonly SessionEvent[] = agent.session.events
    const suffix = events.slice(firstSeq)
    const consumed = foldConsumedWork(suffix)

    let status: LaneRunResult['status'] = 'done'
    let error: string | undefined
    if (timedOut) {
      status = 'timeout'
      error = `lane timed out after ${Math.round(timeoutMs / 1000)}s`
    } else if (cancelled) {
      status = 'cancelled'
      error = 'lane cancelled by user'
    } else if (consumed.end?.data.reason.kind === 'error') {
      status = 'failed'
      const failure = consumed.end.data.reason
      error = `${String((failure as { error?: { code?: string; message?: string } }).error?.code ?? 'error')}: ${String((failure as { error?: { code?: string; message?: string } }).error?.message ?? 'unknown failure')}`
    } else if (consumed.end?.data.reason.kind === 'blocked') {
      status = 'blocked'
      error = 'agent asked a question / requested permission (needs a human) — lane cannot finish unattended'
    } else if (consumed.end?.data.reason.kind === 'aborted') {
      status = 'cancelled'
      error = 'agent turn aborted'
    } else if (!turnEnded && consumed.end === undefined) {
      status = 'failed'
      error = 'agent produced no completed turn'
    }

    return {
      ok: status === 'done',
      status,
      finalAnswer: finalAnswer.slice(0, ANSWER_LIMIT),
      feed,
      tokens: summarizeUsage(usage),
      sessionId,
      error,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      status: timedOut ? 'timeout' : cancelled ? 'cancelled' : 'failed',
      finalAnswer,
      feed,
      tokens: summarizeUsage(usage),
      sessionId,
      error: message,
    }
  } finally {
    clearTimeout(timer)
    // Structured teardown: stop the loop, unregister the agent, unwind scope.
    try {
      await handle?.dispose()
    } catch {
      /* disposal best-effort */
    }
  }
}
