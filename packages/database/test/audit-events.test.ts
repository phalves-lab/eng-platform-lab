import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuditEventInput, AuditEventRepository, ReleaseRunRepository } from '../src/index.js'
import { type IsolatedSchema, createIsolatedSchema } from '../src/testing.js'

const databaseUrl = process.env.DATABASE_URL

const event = (overrides: Partial<AuditEventInput> = {}): AuditEventInput => ({
  actor: 'lider.lab',
  role: 'lead',
  action: 'DELETE /api/conversations/:id',
  kind: 'write',
  target: 'id=0d4f',
  outcome: 'success',
  status: 204,
  ipPrefix: '203.0.113.0',
  releaseRunId: null,
  ...overrides,
})

describe('AuditEventRepository input', () => {
  it('rejects an invalid event before reaching the database', async () => {
    const repository = new AuditEventRepository({} as never)
    await expect(repository.record(event({ status: 42 }))).rejects.toThrow()
    await expect(repository.record(event({ actor: ' ' }))).rejects.toThrow()
    await expect(repository.list({ fromDate: '21/11/2026' })).rejects.toThrow()
    await expect(repository.removeOlderThan('ontem')).rejects.toThrow()
  })
})

describe.skipIf(!databaseUrl)('AuditEventRepository on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('appends events, links release runs and filters newest first', async () => {
    const repository = new AuditEventRepository(db.pool)
    const run = await new ReleaseRunRepository(db.pool).record({
      projectId: 'demo',
      action: 'release',
      actor: 'lider.lab',
      role: 'lead',
      planHash: 'b'.repeat(64),
      plan: {},
      status: 'success',
      result: {},
    })
    const first = await repository.record(event())
    const second = await repository.record(
      event({
        action: 'POST /api/releases/execute',
        target: 'project=demo',
        releaseRunId: run.id,
        status: 200,
      }),
    )
    const third = await repository.record(
      event({ actor: 'ana.dev', role: 'dev', kind: 'read', outcome: 'denied', status: 403 }),
    )

    expect(second).toMatchObject({ releaseRunId: run.id, kind: 'write', status: 200 })
    expect(second.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect((await repository.list()).map((item) => item.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ])
    expect((await repository.list({ actor: 'LIDER.LAB' })).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ])
    expect((await repository.list({ action: 'releases' })).map((item) => item.id)).toEqual([
      second.id,
    ])
    expect(await repository.list({ action: '100%' })).toHaveLength(0)
    expect((await repository.list({ kind: 'read', outcome: 'denied' }))[0]?.id).toBe(third.id)
    expect((await repository.list({ before: third.id, limit: 1 })).map((i) => i.id)).toEqual([
      second.id,
    ])
  })

  it('filters by whole days in the given time zone and applies retention', async () => {
    const repository = new AuditEventRepository(db.pool)
    const late = await repository.record(event({ actor: 'tz.user' }))
    const old = await repository.record(event({ actor: 'tz.user' }))
    await db.pool.query('UPDATE audit_events SET created_at = $2 WHERE id = $1', [
      late.id,
      '2026-11-21T02:30:00.000Z',
    ])
    await db.pool.query('UPDATE audit_events SET created_at = $2 WHERE id = $1', [
      old.id,
      '2025-01-01T12:00:00.000Z',
    ])
    const day = { actor: 'tz.user', fromDate: '2026-11-20', toDate: '2026-11-20' }
    expect(await repository.list({ ...day, timeZone: 'America/Sao_Paulo' })).toHaveLength(1)
    expect(await repository.list({ ...day, timeZone: 'UTC' })).toHaveLength(0)

    expect(await repository.removeOlderThan('2026-01-01T00:00:00.000Z')).toBe(1)
    expect((await repository.list({ actor: 'tz.user' })).map((item) => item.id)).toEqual([late.id])
  })

  it('enforces the event shape in the database as well', async () => {
    const insert = (kind: string, status: number) =>
      db.pool.query(
        `INSERT INTO audit_events (actor, actor_role, action, kind, outcome, status_code)
         VALUES ('x', 'dev', 'GET /x', $1, 'success', $2)`,
        [kind, status],
      )
    await expect(insert('delete', 200)).rejects.toThrow(/check constraint/)
    await expect(insert('write', 42)).rejects.toThrow(/check constraint/)
    await expect(
      db.pool.query(
        `INSERT INTO audit_events (actor, actor_role, action, kind, outcome, status_code, release_run_id)
         VALUES ('x', 'dev', 'POST /x', 'write', 'success', 200, 999999)`,
      ),
    ).rejects.toThrow(/foreign key/)
  })
})
