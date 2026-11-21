import { MetricSnapshotRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { collectPanelData } from '@lab/eng-metrics/collect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEngMetricsCollector } from '../src/collectors/eng-metrics.js'
import { createLogger } from '../src/logger.js'
import { Scheduler } from '../src/scheduler.js'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('worker on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('runs the eng-metrics collector once and keeps a single snapshot per day', async () => {
    const snapshots = new MetricSnapshotRepository(db.pool)
    const collector = createEngMetricsCollector({
      snapshots,
      collect: (now) => collectPanelData({ lab: null, demo: true }, now),
      intervalMs: 60_000,
      timeZone: 'America/Sao_Paulo',
    })
    const times = ['2026-11-20T12:00:00.000Z', '2026-11-20T18:00:00.000Z']
    const logger = createLogger(() => undefined)
    for (const time of times) {
      const scheduler = new Scheduler({
        logger,
        collectors: [collector],
        clock: () => new Date(time),
      })
      expect(await scheduler.runAll()).toEqual([
        { collector: 'eng-metrics', status: 'ok', durationMs: 0 },
      ])
    }

    const latest = await snapshots.latest()
    expect(latest).toHaveLength(1)
    expect(latest[0]).toMatchObject({
      dataset: 'demo',
      day: '2026-11-20',
      collectedAt: '2026-11-20T18:00:00.000Z',
    })
    expect(latest[0]?.payload.queue.length).toBeGreaterThan(0)
    const count = await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM metric_snapshots')
    expect(count.rows[0]?.n).toBe('1')
  })
})
