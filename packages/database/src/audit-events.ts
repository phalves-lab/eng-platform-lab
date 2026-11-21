import type pg from 'pg'
import { z } from 'zod'
import { toIso } from './rows.js'

const RoleSchema = z.enum(['dev', 'lead', 'admin'])
const KindSchema = z.enum(['write', 'read'])
const OutcomeSchema = z.enum(['success', 'denied', 'failed'])

export const AuditEventInputSchema = z.object({
  actor: z.string().trim().min(1).max(200),
  role: RoleSchema,
  action: z.string().trim().min(1).max(200),
  kind: KindSchema,
  target: z.string().trim().min(1).max(200).nullable(),
  outcome: OutcomeSchema,
  status: z.number().int().min(100).max(599),
  ipPrefix: z.string().min(1).max(64).nullable(),
  releaseRunId: z.number().int().positive().nullable(),
})
export type AuditEventInput = z.infer<typeof AuditEventInputSchema>

export interface StoredAuditEvent extends AuditEventInput {
  id: number
  at: string
}

export interface AuditEventFilter {
  actor?: string
  action?: string
  kind?: AuditEventInput['kind']
  outcome?: AuditEventInput['outcome']
  fromDate?: string
  toDate?: string
  timeZone?: string
  before?: number
  limit?: number
}

interface Row {
  id: string
  actor: string
  actor_role: AuditEventInput['role']
  action: string
  kind: AuditEventInput['kind']
  target: string | null
  outcome: AuditEventInput['outcome']
  status_code: number
  ip_prefix: string | null
  release_run_id: string | null
  created_at: Date
}

const COLUMNS =
  'id, actor, actor_role, action, kind, target, outcome, status_code, ip_prefix, release_run_id, created_at'
const MAX_LIMIT = 201
const DateSchema = z.iso.date()

const toEvent = (row: Row): StoredAuditEvent => ({
  id: Number(row.id),
  at: toIso(row.created_at),
  actor: row.actor,
  role: row.actor_role,
  action: row.action,
  kind: row.kind,
  target: row.target,
  outcome: row.outcome,
  status: row.status_code,
  ipPrefix: row.ip_prefix,
  releaseRunId: row.release_run_id === null ? null : Number(row.release_run_id),
})

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => '\\' + char)

const likePattern = (value: string) => `%${escapeLike(value)}%`

/**
 * Append-only audit trail of the portal. Release writes keep their own detail in `release_runs`;
 * an event here only points to it through `releaseRunId`.
 */
export class AuditEventRepository {
  constructor(private readonly pool: pg.Pool) {}

  async record(input: AuditEventInput): Promise<StoredAuditEvent> {
    const event = AuditEventInputSchema.parse(input)
    const result = await this.pool.query<Row>(
      `INSERT INTO audit_events
         (actor, actor_role, action, kind, target, outcome, status_code, ip_prefix, release_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [
        event.actor,
        event.role,
        event.action,
        event.kind,
        event.target,
        event.outcome,
        event.status,
        event.ipPrefix,
        event.releaseRunId,
      ],
    )
    return toEvent(result.rows[0] as Row)
  }

  /** Newest first; `fromDate` and `toDate` are whole days in `timeZone`, both inclusive. */
  async list(filter: AuditEventFilter = {}): Promise<StoredAuditEvent[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT)
    const result = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM audit_events
       WHERE ($1::text IS NULL OR lower(actor) = lower($1))
         AND ($2::text IS NULL OR action ILIKE $2)
         AND ($3::text IS NULL OR kind = $3)
         AND ($4::text IS NULL OR outcome = $4)
         AND ($5::date IS NULL OR created_at >= ($5::date)::timestamp AT TIME ZONE $8)
         AND ($6::date IS NULL OR created_at < ($6::date + 1)::timestamp AT TIME ZONE $8)
         AND ($7::bigint IS NULL OR id < $7)
       ORDER BY id DESC
       LIMIT $9`,
      [
        filter.actor ?? null,
        filter.action ? likePattern(filter.action) : null,
        filter.kind ?? null,
        filter.outcome ?? null,
        filter.fromDate ? DateSchema.parse(filter.fromDate) : null,
        filter.toDate ? DateSchema.parse(filter.toDate) : null,
        filter.before ?? null,
        filter.timeZone ?? 'UTC',
        limit,
      ],
    )
    return result.rows.map(toEvent)
  }

  /** Retention: deletes events recorded before `cutoff` and returns how many. */
  async removeOlderThan(cutoff: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM audit_events WHERE created_at < $1', [
      z.iso.datetime({ offset: true }).parse(cutoff),
    ])
    return result.rowCount ?? 0
  }
}
