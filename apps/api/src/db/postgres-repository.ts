import type pg from 'pg'
import type { CampaignRequest, Channel, Status } from '../domain/campaign-request.js'
import type { CampaignRequestRepository } from '../domain/repository.js'

interface Row {
  id: string
  title: string
  requester_id: string
  business_unit: string
  channel: Channel
  budget_cents: string
  start_date: string
  end_date: string
  status: Status
  approvals: string[]
  created_at: Date
}

const toDomain = (row: Row): CampaignRequest => ({
  id: row.id,
  title: row.title,
  requesterId: row.requester_id,
  businessUnit: row.business_unit,
  channel: row.channel,
  budgetCents: Number(row.budget_cents),
  startDate: row.start_date,
  endDate: row.end_date,
  status: row.status,
  approvals: row.approvals,
  createdAt: row.created_at.toISOString(),
})

const SELECT_COLUMNS = `id, title, requester_id, business_unit, channel, budget_cents,
  to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
  status, approvals, created_at`

export class PostgresCampaignRequestRepository implements CampaignRequestRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(request: CampaignRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO campaign_requests
        (id, title, requester_id, business_unit, channel, budget_cents, start_date, end_date, status, approvals, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        request.id,
        request.title,
        request.requesterId,
        request.businessUnit,
        request.channel,
        request.budgetCents,
        request.startDate,
        request.endDate,
        request.status,
        request.approvals,
        request.createdAt,
      ],
    )
  }

  async findById(id: string): Promise<CampaignRequest | null> {
    const result = await this.pool.query<Row>(
      `SELECT ${SELECT_COLUMNS} FROM campaign_requests WHERE id = $1`,
      [id],
    )
    const row = result.rows[0]
    return row ? toDomain(row) : null
  }

  async update(request: CampaignRequest): Promise<void> {
    await this.pool.query(
      `UPDATE campaign_requests SET status = $2, approvals = $3 WHERE id = $1`,
      [request.id, request.status, request.approvals],
    )
  }
}
