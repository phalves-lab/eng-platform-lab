import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ChangeRepository,
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
        'delivery_changes',
        'deploys',
        'incidents',
        'jira_issues',
        'jira_sprint_issues',
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

    it('lists issues, transitions, sprints and sprint membership by project', async () => {
      const repository = new JiraRepository(db.pool)
      await repository.upsertSprints([
        {
          id: 20,
          project: 'OPS',
          name: 'OPS Sprint 1',
          state: 'closed',
          startsAt: '2026-10-01T12:00:00.000Z',
          endsAt: '2026-10-15T12:00:00.000Z',
          completedAt: '2026-10-15T12:00:00.000Z',
        },
      ])
      await repository.upsertIssues([
        issue('OPS-1', {
          component: 'Filas',
          sprintId: 20,
          summary: 'Reprocessar fila sintética',
          url: 'https://jira.example.test/browse/OPS-1',
        }),
        issue('OPS-2', { component: null, summary: null }),
      ])
      await repository.addStatusChanges([
        {
          issueKey: 'OPS-1',
          fromStatus: 'A fazer',
          toStatus: 'Em andamento',
          changedAt: '2026-10-02T12:00:00.000Z',
        },
      ])
      const membership = [
        { sprintId: 20, issueKey: 'OPS-1', addedAt: '2026-10-01T10:00:00.000Z' },
        { sprintId: 20, issueKey: 'OPS-2', addedAt: null },
      ]
      await repository.upsertSprintIssues(membership)
      await repository.upsertSprintIssues(membership)

      expect(await repository.listProjects()).toEqual(expect.arrayContaining(['LAB', 'OPS']))
      const issues = await repository.listIssues({ project: 'OPS' })
      expect(issues.map((item) => item.key)).toEqual(['OPS-1', 'OPS-2'])
      expect(issues[0]).toMatchObject({
        summary: 'Reprocessar fila sintética',
        url: 'https://jira.example.test/browse/OPS-1',
      })
      expect((await repository.listIssues()).length).toBeGreaterThan(issues.length)
      expect(await repository.listStatusChanges({ project: 'OPS' })).toEqual([
        {
          issueKey: 'OPS-1',
          fromStatus: 'A fazer',
          toStatus: 'Em andamento',
          changedAt: '2026-10-02T12:00:00.000Z',
        },
      ])
      expect((await repository.listSprints({ project: 'OPS' })).map((s) => s.id)).toEqual([20])
      expect(await repository.listSprintIssues({ project: 'OPS' })).toEqual(membership)
      expect(await repository.listSprintIssues({ project: 'LAB' })).toEqual([])
    })

    it('keeps only https links to the issue in the database', async () => {
      await expect(
        db.pool.query(
          `INSERT INTO jira_issues (key, project, issue_type, status, created_at, url)
           VALUES ('OPS-9', 'OPS', 'Story', 'A fazer', now(), 'javascript:alert(1)')`,
        ),
      ).rejects.toThrow(/check constraint/)
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
    it('records deploys idempotently, updates a later rollback and filters them', async () => {
      const repository = new DeployRepository(db.pool)
      const deploy = {
        repo: 'phalves-lab/eng-platform-lab',
        environment: 'production',
        sha: 'abc1234',
        deployedAt: '2026-11-20T12:00:00.000Z',
        status: 'success' as const,
      }
      const stored = { ...deploy, url: null, commitShas: [] }
      expect(
        await repository.record([
          deploy,
          { ...deploy, environment: 'staging', sha: 'def5678', status: 'failure' },
        ]),
      ).toBe(2)
      expect(await repository.record([deploy])).toBe(0)
      expect(await repository.list({ environment: 'production' })).toEqual([stored])
      expect(await repository.list({ since: '2026-11-21T00:00:00.000Z' })).toEqual([])
      expect(await repository.list({ repo: 'phalves-lab/eng-platform-lab' })).toHaveLength(2)

      const rolledBack = {
        ...deploy,
        status: 'rolled_back' as const,
        url: 'https://example.invalid/runs/1',
        commitShas: ['abc1234', 'aaa1111'],
      }
      expect(await repository.record([rolledBack])).toBe(1)
      expect(await repository.record([rolledBack])).toBe(0)
      expect(await repository.list({ environment: 'production' })).toEqual([rolledBack])
    })

    it('upserts incidents with their causing deploy and closes them later', async () => {
      const repository = new IncidentRepository(db.pool)
      const incident = {
        id: 'INC-1',
        system: 'campaign-requests',
        severity: 'sev2' as const,
        startedAt: '2026-11-20T12:00:00.000Z',
        endedAt: null,
      }
      await repository.upsert([incident])
      expect(await repository.list()).toEqual([{ ...incident, title: null, cause: null }])
      const closed = {
        ...incident,
        endedAt: '2026-11-20T13:30:00.000Z',
        title: 'Fila parada',
        cause: { repo: 'phalves-lab/eng-platform-lab', sha: 'abc1234' },
      }
      await repository.upsert([closed])
      expect(await repository.list()).toEqual([closed])
      expect(await repository.list('2026-11-21T00:00:00.000Z')).toEqual([])
      await expect(
        repository.upsert([{ ...incident, id: 'INC-2', endedAt: '2026-11-19T00:00:00.000Z' }]),
      ).rejects.toThrow(/check constraint/)
      await expect(
        db.pool.query(
          `INSERT INTO incidents (id, system, severity, started_at, cause_repo)
           VALUES ('INC-3', 'x', 'sev3', now(), 'phalves-lab/eng-platform-lab')`,
        ),
      ).rejects.toThrow(/incidents_cause_pair_check/)
    })

    it('upserts merged changes and lists them by merge time', async () => {
      const repository = new ChangeRepository(db.pool)
      const change = {
        repo: 'lab-demo/campanhas-api',
        pullNumber: 12,
        mergeSha: 'abcdef123456',
        firstCommitAt: '2026-11-18T09:00:00.000Z',
        mergedAt: '2026-11-19T15:00:00.000Z',
      }
      await repository.upsert([
        change,
        { ...change, pullNumber: 13, mergedAt: '2026-11-20T10:00:00.000Z' },
      ])
      await repository.upsert([{ ...change, title: 'feat: filtro' }])
      expect(await repository.list()).toEqual([
        { ...change, pullNumber: 13, title: '', mergedAt: '2026-11-20T10:00:00.000Z' },
        { ...change, title: 'feat: filtro' },
      ])
      expect(await repository.list('2026-11-20T00:00:00.000Z')).toHaveLength(1)
      await expect(repository.upsert([{ ...change, pullNumber: 0 }])).rejects.toThrow()
    })
  })
})
