import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DeployRepository,
  IncidentRepository,
  JiraRepository,
  MetricSnapshotRepository,
  createPool,
  runMigrations,
} from '../src/index.js'
import { type IsolatedSchema, createIsolatedSchema } from '../src/testing.js'
import { issue, payload } from './factories.js'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('database on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  describe('migrations', () => {
    it('creates every table and is idempotent', async () => {
      expect(await runMigrations(db.pool)).toEqual([])
      const tables = await db.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`,
        [db.schema],
      )
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'chat_conversations',
        'chat_messages',
        'deploys',
        'incidents',
        'jira_issues',
        'jira_sprints',
        'jira_status_changes',
        'metric_snapshots',
        'portal_schema_migrations',
        'release_runs',
      ])
    })

    it('fails when an applied migration was edited and rolls back a broken one', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'migrations-'))
      await writeFile(join(directory, '001_metric_snapshots.sql'), 'SELECT 1')
      await expect(runMigrations(db.pool, { directory })).rejects.toThrow(
        'Migration 001_metric_snapshots.sql changed after being applied',
      )

      const fresh = await createIsolatedSchema(databaseUrl as string)
      const broken = await mkdtemp(join(tmpdir(), 'migrations-'))
      await writeFile(join(broken, '001_ok.sql'), 'CREATE TABLE IF NOT EXISTS ok_table (id INT)')
      await writeFile(join(broken, '002_broken.sql'), 'CREATE TABLE nope (')
      const pool = createPool({ connectionString: databaseUrl as string, searchPath: fresh.schema })
      await expect(runMigrations(pool, { directory: broken })).rejects.toThrow()
      const applied = await pool.query<{ name: string }>(
        `SELECT name FROM portal_schema_migrations WHERE name IN ('001_ok.sql', '002_broken.sql')`,
      )
      expect(applied.rows.map((row) => row.name)).toEqual(['001_ok.sql'])
      await pool.end()
      await fresh.drop()
    })

    it('serializes concurrent runners', async () => {
      const fresh = await createIsolatedSchema(databaseUrl as string)
      await fresh.pool.query('DROP TABLE portal_schema_migrations, metric_snapshots CASCADE')
      const runs = await Promise.all([runMigrations(fresh.pool), runMigrations(fresh.pool)])
      expect(runs.flat().filter((name) => name === '001_metric_snapshots.sql')).toHaveLength(1)
      await fresh.drop()
    })
  })

  describe('MetricSnapshotRepository', () => {
    it('keeps one snapshot per dataset and day and returns the latest per dataset', async () => {
      const repository = new MetricSnapshotRepository(db.pool)
      await repository.save({
        day: '2026-11-19',
        payload: payload('lab', '2026-11-19T12:00:00.000Z'),
        collectedAt: '2026-11-19T12:00:00.000Z',
      })
      await repository.save({
        day: '2026-11-20',
        payload: payload('lab', '2026-11-20T09:00:00.000Z'),
        collectedAt: '2026-11-20T09:00:00.000Z',
      })
      const replaced = await repository.save({
        day: '2026-11-20',
        payload: payload('lab', '2026-11-20T18:00:00.000Z'),
        collectedAt: '2026-11-20T18:00:00.000Z',
      })
      await repository.save({
        day: '2026-11-18',
        payload: payload('demo'),
        collectedAt: '2026-11-18T12:00:00.000Z',
      })

      expect(replaced).toMatchObject({ dataset: 'lab', day: '2026-11-20' })
      const latest = await repository.latest()
      expect(latest.map((s) => [s.dataset, s.day, s.payload.generatedAt])).toEqual([
        ['demo', '2026-11-18', '2026-11-20T12:00:00.000Z'],
        ['lab', '2026-11-20', '2026-11-20T18:00:00.000Z'],
      ])
      expect(await repository.find('lab', '2026-11-19')).toMatchObject({ day: '2026-11-19' })
      expect(await repository.find('lab', '2026-01-01')).toBeNull()
    })

    it('validates the payload on write and on read', async () => {
      const repository = new MetricSnapshotRepository(db.pool)
      await expect(
        repository.save({
          day: '2026-11-20',
          payload: { ...payload('lab'), queue: 'x' } as never,
          collectedAt: '2026-11-20T09:00:00.000Z',
        }),
      ).rejects.toThrow()
      await db.pool.query(
        `INSERT INTO metric_snapshots (dataset, day, payload) VALUES ('legacy', '2026-11-01', '{"id":"legacy"}')`,
      )
      await expect(repository.find('legacy', '2026-11-01')).rejects.toThrow(
        'Snapshot legacy/2026-11-01 has an invalid payload',
      )
      await db.pool.query(`DELETE FROM metric_snapshots WHERE dataset = 'legacy'`)
    })

    it('enforces the payload shape in the database as well', async () => {
      await expect(
        db.pool.query(
          `INSERT INTO metric_snapshots (dataset, day, payload) VALUES ('lab', '2026-10-01', '[]')`,
        ),
      ).rejects.toThrow(/check constraint/)
    })
  })

  describe('JiraRepository', () => {
    it('upserts issues and sprints and records each transition once', async () => {
      const repository = new JiraRepository(db.pool)
      await repository.upsertSprints([
        {
          id: 10,
          project: 'LAB',
          name: 'Sprint 10',
          state: 'active',
          startsAt: '2026-11-10T12:00:00.000Z',
          endsAt: '2026-11-24T12:00:00.000Z',
          completedAt: null,
        },
      ])
      await repository.upsertIssues([issue('LAB-21', { sprintId: 10 })])
      await repository.upsertIssues([
        issue('LAB-21', {
          sprintId: 10,
          status: 'Concluída',
          resolvedAt: '2026-11-20T12:00:00.000Z',
        }),
      ])
      const changes = [
        {
          issueKey: 'LAB-21',
          fromStatus: null,
          toStatus: 'Em andamento',
          changedAt: '2026-11-11T12:00:00.000Z',
        },
        {
          issueKey: 'LAB-21',
          fromStatus: 'Em andamento',
          toStatus: 'Concluída',
          changedAt: '2026-11-20T12:00:00.000Z',
        },
      ]
      expect(await repository.addStatusChanges(changes)).toBe(2)
      expect(await repository.addStatusChanges(changes)).toBe(0)

      expect(await repository.findIssue('LAB-21')).toMatchObject({
        status: 'Concluída',
        sprintId: 10,
        resolvedAt: '2026-11-20T12:00:00.000Z',
      })
      expect(await repository.findIssue('LAB-999')).toBeNull()
      expect(await repository.findSprint(10)).toMatchObject({ name: 'Sprint 10', state: 'active' })
      expect(await repository.findSprint(99)).toBeNull()
      expect((await repository.statusChanges('LAB-21')).map((c) => c.toStatus)).toEqual([
        'Em andamento',
        'Concluída',
      ])
    })

    it('rejects issues that break integrity rules in the database', async () => {
      const repository = new JiraRepository(db.pool)
      await expect(repository.upsertIssues([issue('LAB-22', { project: 'MDI' })])).rejects.toThrow(
        /check constraint/,
      )
      await expect(
        repository.upsertIssues([
          issue('LAB-23', {
            createdAt: '2026-11-20T12:00:00.000Z',
            resolvedAt: '2026-11-19T12:00:00.000Z',
          }),
        ]),
      ).rejects.toThrow(/check constraint/)
      await expect(repository.upsertIssues([issue('LAB-24', { sprintId: 404 })])).rejects.toThrow(
        /foreign key/,
      )
      await expect(
        repository.upsertSprints([
          {
            id: 11,
            project: 'LAB',
            name: 'Sprint 11',
            state: 'closed',
            startsAt: null,
            endsAt: null,
            completedAt: null,
          },
        ]),
      ).rejects.toThrow(/check constraint/)
      await expect(
        repository.addStatusChanges([
          {
            issueKey: 'LAB-404',
            fromStatus: null,
            toStatus: 'Em andamento',
            changedAt: '2026-11-11T12:00:00.000Z',
          },
        ]),
      ).rejects.toThrow(/foreign key/)
      expect(await repository.findIssue('LAB-22')).toBeNull()
    })
  })

  describe('delivery repositories', () => {
    it('records deploys idempotently and filters them', async () => {
      const repository = new DeployRepository(db.pool)
      const deploy = {
        repo: 'phalves-lab/eng-platform-lab',
        environment: 'production',
        sha: 'abc1234',
        deployedAt: '2026-11-20T12:00:00.000Z',
        status: 'success' as const,
      }
      expect(
        await repository.record([
          deploy,
          { ...deploy, environment: 'staging', sha: 'def5678', status: 'failure' },
        ]),
      ).toBe(2)
      expect(await repository.record([deploy])).toBe(0)
      expect(await repository.list({ environment: 'production' })).toEqual([deploy])
      expect(await repository.list({ since: '2026-11-21T00:00:00.000Z' })).toEqual([])
      expect(await repository.list({ repo: 'phalves-lab/eng-platform-lab' })).toHaveLength(2)
    })

    it('upserts incidents and closes them later', async () => {
      const repository = new IncidentRepository(db.pool)
      const incident = {
        id: 'INC-1',
        system: 'campaign-requests',
        severity: 'sev2' as const,
        startedAt: '2026-11-20T12:00:00.000Z',
        endedAt: null,
      }
      await repository.upsert([incident])
      await repository.upsert([{ ...incident, endedAt: '2026-11-20T13:30:00.000Z' }])
      expect(await repository.list()).toEqual([
        { ...incident, endedAt: '2026-11-20T13:30:00.000Z' },
      ])
      expect(await repository.list('2026-11-21T00:00:00.000Z')).toEqual([])
      await expect(
        repository.upsert([{ ...incident, id: 'INC-2', endedAt: '2026-11-19T00:00:00.000Z' }]),
      ).rejects.toThrow(/check constraint/)
    })
  })
})
