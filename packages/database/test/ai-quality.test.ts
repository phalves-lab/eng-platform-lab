import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AiUsageRepository, EvalRunRepository } from '../src/index.js'
import { type IsolatedSchema, createIsolatedSchema } from '../src/testing.js'

const databaseUrl = process.env.DATABASE_URL

const run = (overrides: Partial<EvalRun> = {}): EvalRun => ({
  id: 'bot-2026-11-20-abc1234',
  suite: 'bot',
  runAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  model: 'gemini-2.5-pro',
  promptVersion: '1.1.0',
  offline: false,
  total: 10,
  passed: 8,
  inputTokens: 1000,
  outputTokens: 200,
  latencyMs: { p50: 1500, max: 4000 },
  cases: [{ id: '001', passed: true, latencyMs: 900, inputTokens: 100, outputTokens: 20 }],
  ...overrides,
})

const usage = (overrides: Partial<AiUsageRecord> = {}): AiUsageRecord => ({
  id: 'bot-2026-11-20-0000000001',
  occurredAt: '2026-11-20T12:00:00.000Z',
  origin: 'bot',
  model: 'gemini-2.5-pro',
  inputTokens: 12000,
  outputTokens: 900,
  costUsd: 0.024,
  pricingVersion: '2026-11-01',
  team: '@phalves-lab/campanhas',
  skill: null,
  repository: 'lab-demo/campanhas-api',
  pullRequest: 42,
  runId: null,
  ...overrides,
})

describe('AI quality repositories input', () => {
  it('rejects runs and records outside the contract before reaching the database', async () => {
    const runs = new EvalRunRepository({} as never)
    const records = new AiUsageRepository({} as never)
    await expect(runs.save([run({ passed: 11 })], 'local')).rejects.toThrow()
    await expect(runs.save([run()], 'manual' as never)).rejects.toThrow()
    await expect(
      records.record([{ ...usage(), login: 'pessoa.lab' } as AiUsageRecord]),
    ).rejects.toThrow()
  })
})

describe.skipIf(!databaseUrl)('AI quality repositories on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('stores each eval run once and lists the window in time order', async () => {
    const repository = new EvalRunRepository(db.pool)
    const older = run({ id: 'bot-2026-11-13-def5678', runAt: '2026-11-13T10:00:00.000Z' })
    const offline = run({
      id: 'chat-offline-2026-11-21',
      suite: 'chat',
      runAt: '2026-11-21T09:00:00.000Z',
      offline: true,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      cases: [],
    })
    expect(await repository.save([run(), older, offline], 'fixture')).toBe(3)
    expect(await repository.save([run({ passed: 1 })], 'github')).toBe(0)

    const listed = await repository.list('2026-11-01T00:00:00.000Z')
    expect(listed.map((item) => item.id)).toEqual([older.id, run().id, offline.id])
    expect(listed[1]).toEqual(run())
    expect(listed[2]).toMatchObject({ latencyMs: null, inputTokens: null, offline: true })
    expect(await repository.list('2026-11-20T12:00:00.000Z')).toHaveLength(1)
  })

  it('stores usage records idempotently with the cost as a number', async () => {
    const repository = new AiUsageRepository(db.pool)
    const chat = usage({
      id: 'chat-2026-11-21-0000000001',
      origin: 'chat',
      occurredAt: '2026-11-21T08:00:00.000Z',
      costUsd: null,
      pricingVersion: null,
      team: null,
      repository: null,
      pullRequest: null,
    })
    expect(await repository.record([usage(), chat])).toBe(2)
    expect(await repository.record([usage()])).toBe(0)
    expect(await repository.record([])).toBe(0)
    expect(await repository.list('2026-11-01T00:00:00.000Z')).toEqual([usage(), chat])
  })

  it('enforces the shape in the database as well', async () => {
    const insertRun = (passed: number, total: number) =>
      db.pool.query(
        `INSERT INTO ai_eval_runs (id, suite, run_at, commit_sha, model, prompt_version, total,
           passed, source)
         VALUES ('bot-check-0001', 'bot', now(), 'abc1234', 'm', 'v', $1, $2, 'local')`,
        [total, passed],
      )
    await expect(insertRun(5, 4)).rejects.toThrow(/check constraint/)
    const insertUsage = (cost: number | null, version: string | null) =>
      db.pool.query(
        `INSERT INTO ai_usage_records (id, occurred_at, origin, model, input_tokens,
           output_tokens, cost_usd, pricing_version)
         VALUES ('chat-check-0001', now(), 'chat', 'm', 1, 1, $1, $2)`,
        [cost, version],
      )
    await expect(insertUsage(0.1, null)).rejects.toThrow(/check constraint/)
  })
})
