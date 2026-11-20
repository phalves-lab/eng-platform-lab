import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDraft } from '../../src/domain/campaign-request.js'
import { runMigrations } from '../../src/db/migrate.js'
import { PostgresCampaignRequestRepository } from '../../src/db/postgres-repository.js'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('PostgresCampaignRequestRepository', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl })
    await runMigrations(pool, fileURLToPath(new URL('../../migrations', import.meta.url)))
  })

  afterAll(async () => {
    await pool.end()
  })

  it('aplica migrations de forma idempotente', async () => {
    expect(
      await runMigrations(pool, fileURLToPath(new URL('../../migrations', import.meta.url))),
    ).toEqual([])
  })

  it('persiste, lê e atualiza uma solicitação', async () => {
    const repository = new PostgresCampaignRequestRepository(pool)
    const id = randomUUID()
    const draft = createDraft(
      {
        title: 'Vestibular Medicina',
        requesterId: 'ana',
        businessUnit: 'graduacao',
        channel: 'paid_media',
        budgetCents: 7_500_000,
        startDate: '2026-12-01',
        endDate: '2026-12-15',
      },
      { id, today: '2026-11-20', now: '2026-11-20T12:00:00.000Z' },
    )
    if (!draft.ok) throw new Error(draft.error.message)

    await repository.insert(draft.value)
    expect(await repository.findById(id)).toMatchObject({
      budgetCents: 7_500_000,
      startDate: '2026-12-01',
      approvals: [],
    })

    expect((await repository.findById(id))?.rejectionReason).toBeNull()
    await repository.update({
      ...draft.value,
      status: 'rejected',
      approvals: ['bruno'],
      rejectionReason: 'Orçamento acima do teto da BU',
    })
    expect((await repository.findById(id))?.rejectionReason).toBe('Orçamento acima do teto da BU')
    await repository.update({ ...draft.value, status: 'submitted', approvals: ['bruno'] })
    expect(await repository.findById(id)).toMatchObject({
      status: 'submitted',
      approvals: ['bruno'],
    })
    expect(await repository.findById(randomUUID())).toBeNull()
  })

  it('banco recusa motivo de rejeição curto mesmo sem passar pelo domínio', async () => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO campaign_requests (id, title, requester_id, business_unit, channel, budget_cents, start_date, end_date, status)
       VALUES ($1, 'Teste', 'ana', 'ead', 'email', 0, '2026-12-01', '2026-12-10', 'submitted')`,
      [id],
    )
    await expect(
      pool.query(`UPDATE campaign_requests SET rejection_reason = 'curto' WHERE id = $1`, [id]),
    ).rejects.toThrow()
  })

  it('banco recusa período invertido mesmo sem passar pelo domínio', async () => {
    await expect(
      pool.query(
        `INSERT INTO campaign_requests (id, title, requester_id, business_unit, channel, budget_cents, start_date, end_date, status)
         VALUES ($1, 'Teste', 'ana', 'ead', 'email', 0, '2026-12-10', '2026-12-01', 'draft')`,
        [randomUUID()],
      ),
    ).rejects.toThrow()
  })
})
