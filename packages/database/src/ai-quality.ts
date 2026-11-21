import {
  type AiUsageRecord,
  AiUsageRecordSchema,
  EvalCaseOutcomeSchema,
  type EvalRun,
  EvalRunSchema,
} from '@lab/contracts'
import type pg from 'pg'
import { z } from 'zod'
import { toIso } from './rows.js'

export const EvalRunSourceSchema = z.enum(['local', 'fixture', 'github'])
export type EvalRunSource = z.infer<typeof EvalRunSourceSchema>

interface EvalRunRow {
  id: string
  suite: EvalRun['suite']
  run_at: Date
  commit_sha: string
  model: string
  prompt_version: string
  offline: boolean
  total: number
  passed: number
  input_tokens: number | null
  output_tokens: number | null
  latency_p50_ms: number | null
  latency_max_ms: number | null
  cases: unknown
}

interface UsageRow {
  id: string
  occurred_at: Date
  origin: AiUsageRecord['origin']
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: string | null
  pricing_version: string | null
  team: string | null
  skill: string | null
  repository: string | null
  pull_request: number | null
  run_id: string | null
}

const CasesSchema = z.array(EvalCaseOutcomeSchema)

const toRun = (row: EvalRunRow): EvalRun => ({
  id: row.id,
  suite: row.suite,
  runAt: toIso(row.run_at),
  commit: row.commit_sha,
  model: row.model,
  promptVersion: row.prompt_version,
  offline: row.offline,
  total: row.total,
  passed: row.passed,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  latencyMs:
    row.latency_p50_ms === null || row.latency_max_ms === null
      ? null
      : { p50: row.latency_p50_ms, max: row.latency_max_ms },
  cases: CasesSchema.parse(row.cases),
})

const toUsage = (row: UsageRow): AiUsageRecord => ({
  id: row.id,
  occurredAt: toIso(row.occurred_at),
  origin: row.origin,
  model: row.model,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
  pricingVersion: row.pricing_version,
  team: row.team,
  skill: row.skill,
  repository: row.repository,
  pullRequest: row.pull_request,
  runId: row.run_id,
})

const RUN_COLUMNS = `id, suite, run_at, commit_sha, model, prompt_version, offline, total, passed,
  input_tokens, output_tokens, latency_p50_ms, latency_max_ms, cases`

const USAGE_COLUMNS = `id, occurred_at, origin, model, input_tokens, output_tokens, cost_usd,
  pricing_version, team, skill, repository, pull_request, run_id`

/** Golden set runs of the bot and the chat. A run id is stored once; later copies are ignored. */
export class EvalRunRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(runs: EvalRun[], source: EvalRunSource): Promise<number> {
    const origin = EvalRunSourceSchema.parse(source)
    let written = 0
    for (const input of runs) {
      const run = EvalRunSchema.parse(input)
      const result = await this.pool.query(
        `INSERT INTO ai_eval_runs (${RUN_COLUMNS}, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          run.id,
          run.suite,
          run.runAt,
          run.commit,
          run.model,
          run.promptVersion,
          run.offline,
          run.total,
          run.passed,
          run.inputTokens,
          run.outputTokens,
          run.latencyMs?.p50 ?? null,
          run.latencyMs?.max ?? null,
          JSON.stringify(run.cases),
          origin,
        ],
      )
      written += result.rowCount ?? 0
    }
    return written
  }

  async list(since: string): Promise<EvalRun[]> {
    const result = await this.pool.query<EvalRunRow>(
      `SELECT ${RUN_COLUMNS} FROM ai_eval_runs WHERE run_at >= $1 ORDER BY run_at, id`,
      [since],
    )
    return result.rows.map(toRun)
  }
}

/** One row per model call, with ids and counts only. Inserting a known id is a no-op. */
export class AiUsageRepository {
  constructor(private readonly pool: pg.Pool) {}

  async record(records: AiUsageRecord[]): Promise<number> {
    const items = records.map((input) => AiUsageRecordSchema.parse(input))
    if (!items.length) return 0
    const column = <T>(pick: (item: AiUsageRecord) => T) => items.map(pick)
    const result = await this.pool.query(
      `INSERT INTO ai_usage_records (${USAGE_COLUMNS})
       SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::text[], $4::text[], $5::int[],
         $6::int[], $7::numeric[], $8::text[], $9::text[], $10::text[], $11::text[], $12::int[],
         $13::text[])
       ON CONFLICT (id) DO NOTHING`,
      [
        column((item) => item.id),
        column((item) => item.occurredAt),
        column((item) => item.origin),
        column((item) => item.model),
        column((item) => item.inputTokens),
        column((item) => item.outputTokens),
        column((item) => item.costUsd),
        column((item) => item.pricingVersion),
        column((item) => item.team),
        column((item) => item.skill),
        column((item) => item.repository),
        column((item) => item.pullRequest),
        column((item) => item.runId),
      ],
    )
    return result.rowCount ?? 0
  }

  async list(since: string): Promise<AiUsageRecord[]> {
    const result = await this.pool.query<UsageRow>(
      `SELECT ${USAGE_COLUMNS} FROM ai_usage_records WHERE occurred_at >= $1
       ORDER BY occurred_at, id`,
      [since],
    )
    return result.rows.map(toUsage)
  }
}
