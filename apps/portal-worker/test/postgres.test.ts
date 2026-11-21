import {
  ChangeRepository,
  DeployRepository,
  IncidentRepository,
  MetricSnapshotRepository,
} from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { collectPanelData } from '@lab/eng-metrics/collect'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDoraCollector } from '../src/collectors/dora/collector.js'
import { createFixtureSource } from '../src/collectors/dora/fixture-source.js'
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

  it('stores the lab DORA fixtures and incidents once, even when run again', async () => {
    const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
    const deploys = new DeployRepository(db.pool)
    const collector = createDoraCollector({
      catalogFile: repoPath('catalog/dora/repos.yaml'),
      incidentsDir: repoPath('catalog/incidents'),
      fixtures: createFixtureSource(repoPath('fixtures/dora')),
      github: null,
      deploys,
      changes: new ChangeRepository(db.pool),
      incidents: new IncidentRepository(db.pool),
      intervalMs: 60_000,
    })
    const logger = createLogger(() => undefined)
    const now = new Date('2026-11-21T12:00:00.000Z')
    await collector.run({ now, logger })
    const first = await deploys.list()
    await collector.run({ now, logger })

    expect(await deploys.list()).toEqual(first)
    expect(first.some((deploy) => deploy.repo === 'lab-demo/notificacoes-worker')).toBe(true)
    expect(await new IncidentRepository(db.pool).list()).toHaveLength(6)
    expect((await new ChangeRepository(db.pool).list()).length).toBeGreaterThan(100)
  })
})
