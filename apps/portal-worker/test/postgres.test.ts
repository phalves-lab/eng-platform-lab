import {
  ChangeRepository,
  DeployRepository,
  IncidentRepository,
  JiraRepository,
  MetricSnapshotRepository,
} from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { collectPanelData } from '@lab/eng-metrics/collect'
import { loadWorkflow } from '@lab/flow'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDoraCollector } from '../src/collectors/dora/collector.js'
import { createFixtureSource } from '../src/collectors/dora/fixture-source.js'
import { createEngMetricsCollector } from '../src/collectors/eng-metrics.js'
import { createJiraCollector } from '../src/collectors/jira/collector.js'
import { createFixtureJiraSource } from '../src/collectors/jira/fixture-source.js'
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

  it('mirrors the fixture board idempotently with the Jira collector', async () => {
    const repository = new JiraRepository(db.pool)
    const collector = createJiraCollector({
      source: createFixtureJiraSource({
        dir: fileURLToPath(new URL('../../../fixtures/jira-board', import.meta.url)),
        rebase: false,
      }),
      repository,
      workflow: await loadWorkflow(
        fileURLToPath(new URL('../../../catalog/jira/workflow.yaml', import.meta.url)),
      ),
      intervalMs: 60_000,
    })
    const count = async (table: string) =>
      Number((await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n)
    const lines: string[] = []
    const scheduler = new Scheduler({
      logger: createLogger((line) => lines.push(line)),
      collectors: [collector],
      clock: () => new Date('2026-11-20T12:00:00.000Z'),
    })
    expect((await scheduler.runAll())[0]?.status).toBe('ok')
    const first = {
      issues: await count('jira_issues'),
      changes: await count('jira_status_changes'),
      sprints: await count('jira_sprints'),
      members: await count('jira_sprint_issues'),
    }
    expect((await scheduler.runAll())[0]?.status).toBe('ok')
    expect({
      issues: await count('jira_issues'),
      changes: await count('jira_status_changes'),
      sprints: await count('jira_sprints'),
      members: await count('jira_sprint_issues'),
    }).toEqual(first)
    expect(first.issues).toBeGreaterThanOrEqual(60)
    expect(first.sprints).toBe(10)
    expect(await repository.listProjects()).toEqual(['LAB', 'OPS'])
    const synced = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(synced.filter((log) => log.msg === 'jira.synced').map((log) => log.newChanges)).toEqual([
      first.changes,
      0,
    ])
  })
})
