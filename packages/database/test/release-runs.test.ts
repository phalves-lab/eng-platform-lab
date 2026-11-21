import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ReleaseRunInput, ReleaseRunRepository } from '../src/index.js'
import { type IsolatedSchema, createIsolatedSchema } from '../src/testing.js'

const databaseUrl = process.env.DATABASE_URL
const HASH = 'a'.repeat(64)

const run = (overrides: Partial<ReleaseRunInput> = {}): ReleaseRunInput => ({
  projectId: 'demo',
  action: 'release',
  actor: 'lider.lab',
  role: 'lead',
  planHash: HASH,
  plan: { kind: 'release', steps: [] },
  status: 'success',
  result: { status: 'success', pulls: [] },
  ...overrides,
})

describe('ReleaseRunRepository input', () => {
  it('rejects an invalid run before reaching the database', async () => {
    const repository = new ReleaseRunRepository({} as never)
    await expect(repository.record(run({ planHash: 'nope' }))).rejects.toThrow()
    await expect(repository.record(run({ projectId: 'Demo X' }))).rejects.toThrow()
  })
})

describe.skipIf(!databaseUrl)('ReleaseRunRepository on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('appends runs and lists them per project, newest first, filtered by action', async () => {
    const repository = new ReleaseRunRepository(db.pool)
    const first = await repository.record(run())
    const second = await repository.record(
      run({ action: 'publish', status: 'failed', result: { error: 'x' } }),
    )
    await repository.record(run({ projectId: 'other' }))

    expect(first).toMatchObject({ projectId: 'demo', actor: 'lider.lab', role: 'lead' })
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const all = await repository.list({ projectId: 'demo' })
    expect(all.map((item) => item.id)).toEqual([second.id, first.id])
    expect(all[0]).toMatchObject({ action: 'publish', status: 'failed', result: { error: 'x' } })
    const releases = await repository.list({ projectId: 'demo', action: 'release', limit: 1 })
    expect(releases.map((item) => item.id)).toEqual([first.id])
  })

  it('enforces the audit shape in the database as well', async () => {
    const insert = (status: string, plan: string) =>
      db.pool.query(
        `INSERT INTO release_runs (project_id, action, actor, actor_role, plan_hash, plan, status, result)
         VALUES ('demo', 'release', 'x', 'lead', $1, $2, $3, '{}')`,
        [HASH, plan, status],
      )
    await expect(insert('merged', '{}')).rejects.toThrow(/check constraint/)
    await expect(insert('success', '[]')).rejects.toThrow(/check constraint/)
  })
})
