import { AuditEventRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuditRetentionCollector } from '../src/collectors/audit-retention.js'
import { createLogger } from '../src/logger.js'
import { Scheduler } from '../src/scheduler.js'

const databaseUrl = process.env.DATABASE_URL

describe('audit-retention collector', () => {
  it('deletes events older than the retention and logs the count', async () => {
    const removeOlderThan = vi.fn(() => Promise.resolve(4))
    const lines: string[] = []
    const collector = createAuditRetentionCollector({
      events: { removeOlderThan },
      retentionDays: 365,
      intervalMs: 60_000,
    })
    await collector.run({
      now: new Date('2026-11-21T12:00:00.000Z'),
      logger: createLogger((line) => lines.push(line)),
    })

    expect(collector).toMatchObject({ name: 'audit-retention', schedule: { intervalMs: 60_000 } })
    expect(removeOlderThan).toHaveBeenCalledWith('2025-11-21T12:00:00.000Z')
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      msg: 'audit.retention',
      removed: 4,
      retentionDays: 365,
    })
  })
})

describe.skipIf(!databaseUrl)('audit retention on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('keeps recent events and deletes the ones past the retention', async () => {
    const events = new AuditEventRepository(db.pool)
    const base = {
      actor: 'admin.lab',
      role: 'admin' as const,
      action: 'GET /api/audit',
      kind: 'read' as const,
      target: null,
      outcome: 'success' as const,
      status: 200,
      ipPrefix: null,
      releaseRunId: null,
    }
    const old = await events.record(base)
    const recent = await events.record(base)
    await db.pool.query('UPDATE audit_events SET created_at = $2 WHERE id = $1', [
      old.id,
      '2025-06-01T12:00:00.000Z',
    ])

    const scheduler = new Scheduler({
      logger: createLogger(() => undefined),
      collectors: [
        createAuditRetentionCollector({ events, retentionDays: 365, intervalMs: 60_000 }),
      ],
      clock: () => new Date('2026-11-21T12:00:00.000Z'),
    })
    expect(await scheduler.runAll()).toEqual([
      { collector: 'audit-retention', status: 'ok', durationMs: 0 },
    ])
    expect((await events.list()).map((event) => event.id)).toEqual([recent.id])
  })
})
