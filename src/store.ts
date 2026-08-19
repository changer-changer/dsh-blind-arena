import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  type ArenaExperiment,
  type ArenaSecrets,
  type ExperimentSummary,
  LANE_LABELS,
  type LaneLabel,
} from './types.ts'
import { arenaHome, experimentPath, secretsPath } from './util.ts'

/**
 * Durable experiment store under ~/.dsh/arena/<id>/.
 *
 * Two files per experiment:
 *   experiment.json — the public, identity-free record (this is exactly what
 *                     the wire serves before reveal)
 *   secrets.json    — lane identities + agent session ids; read only by the
 *                     host, merged into the wire view after reveal
 */
export interface ExperimentStore {
  save(exp: ArenaExperiment, secrets?: ArenaSecrets): Promise<void>
  load(id: string): Promise<{ exp: ArenaExperiment; secrets?: ArenaSecrets } | undefined>
  list(): Promise<ExperimentSummary[]>
  listIds(): Promise<string[]>
  readDiff(id: string, label: LaneLabel): Promise<string>
}

export function fileStore(): ExperimentStore {
  async function ensureHome(): Promise<void> {
    await mkdir(arenaHome(), { recursive: true })
  }

  return {
    async save(exp, secrets) {
      await ensureHome()
      const dir = join(arenaHome(), exp.id)
      await mkdir(dir, { recursive: true })
      // Write atomically: tmp + rename is overkill for local single-writer;
      // sequential write with stable ordering is fine and crash-safe enough
      // (worst case: truncated JSON is ignored on next read).
      await writeFile(experimentPath(exp.id), `${JSON.stringify(exp, null, 2)}\n`, 'utf8')
      if (secrets) {
        await writeFile(join(dir, 'secrets.json'), `${JSON.stringify(secrets, null, 2)}\n`, 'utf8')
      }
    },

    async load(id) {
      if (!/^[a-z0-9-]+$/.test(id)) return undefined
      const expFile = experimentPath(id)
      if (!existsSync(expFile)) return undefined
      try {
        const raw = await readFile(expFile, 'utf8')
        const exp = JSON.parse(raw) as ArenaExperiment
        let secrets: ArenaSecrets | undefined
        if (existsSync(secretsPath(id))) {
          try {
            secrets = JSON.parse(await readFile(secretsPath(id), 'utf8')) as ArenaSecrets
          } catch {
            secrets = undefined
          }
        }
        return { exp, secrets }
      } catch {
        return undefined
      }
    },

    async list() {
      await ensureHome()
      let entries: string[] = []
      try {
        entries = await readdir(arenaHome())
      } catch {
        return []
      }
      const summaries: ExperimentSummary[] = []
      for (const entry of entries) {
        if (!entry.startsWith('ar-')) continue
        const id = basename(entry)
        const loaded = await this.load(id)
        if (!loaded) continue
        const { exp } = loaded
        summaries.push({
          id: exp.id,
          createdAt: exp.createdAt,
          demo: exp.demo,
          task: exp.task,
          repoPath: exp.repoPath,
          laneCount: exp.lanes.length,
          phase: exp.phase,
          verdict: exp.verdict,
          revealedAt: exp.revealedAt,
          comparability: exp.comparability,
        })
      }
      summaries.sort((a, b) => b.createdAt - a.createdAt)
      return summaries
    },

    async listIds() {
      const summaries = await this.list()
      return summaries.map((s) => s.id)
    },

    async readDiff(id, label) {
      const file = join(arenaHome(), id, 'diffs', `${label}.patch`)
      try {
        return await readFile(file, 'utf8')
      } catch {
        return ''
      }
    },
  }
}

/** Merge secrets into the public record for the post-reveal wire view. */
export function revealedExperiment(exp: ArenaExperiment, secrets: ArenaSecrets | undefined): ArenaExperiment {
  if (!secrets) return exp
  return {
    ...exp,
    lanes: exp.lanes.map((lane) => ({
      ...lane,
      identity: secrets.identities[lane.label],
      agentSessionId: secrets.agentSessions[lane.label],
    })),
  }
}

/**
 * Defense-in-depth: strip any `identity`/`agentSessionId` from lanes.
 * Applied to every experiment before reveal reaches the wire, so a bug in the
 * store cannot leak identities even if a persisted file already contained them.
 */
export function redactExperiment(exp: ArenaExperiment): ArenaExperiment {
  return {
    ...exp,
    lanes: exp.lanes.map((lane) => {
      const { identity: _identity, agentSessionId: _agentSessionId, ...rest } = lane
      return rest
    }),
  }
}

export { LANE_LABELS }
