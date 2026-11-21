import type pg from 'pg'
import { z } from 'zod'
import { toIso } from './rows.js'

const JsonObjectSchema = z.record(z.string(), z.unknown())

export const ReleaseRunInputSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  action: z.enum(['release', 'publish']),
  actor: z.string().min(1).max(200),
  role: z.enum(['dev', 'lead', 'admin']),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  plan: JsonObjectSchema,
  status: z.enum(['success', 'failed', 'rejected']),
  result: JsonObjectSchema,
})
export type ReleaseRunInput = z.infer<typeof ReleaseRunInputSchema>

export interface StoredReleaseRun extends ReleaseRunInput {
  id: number
  createdAt: string
}

export interface ReleaseRunFilter {
  projectId: string
  action?: ReleaseRunInput['action']
  limit?: number
}

interface Row {
  id: string
  project_id: string
  action: ReleaseRunInput['action']
  actor: string
  actor_role: ReleaseRunInput['role']
  plan_hash: string
  plan: Record<string, unknown>
  status: ReleaseRunInput['status']
  result: Record<string, unknown>
  created_at: Date
}

const COLUMNS =
  'id, project_id, action, actor, actor_role, plan_hash, plan, status, result, created_at'
const MAX_LIMIT = 200

const toRun = (row: Row): StoredReleaseRun => ({
  id: Number(row.id),
  projectId: row.project_id,
  action: row.action,
  actor: row.actor,
  role: row.actor_role,
  planHash: row.plan_hash,
  plan: row.plan,
  status: row.status,
  result: row.result,
  createdAt: toIso(row.created_at),
})

/** Append-only audit of release writes: who ran which plan, when, and what came out of it. */
export class ReleaseRunRepository {
  constructor(private readonly pool: pg.Pool) {}

  async record(input: ReleaseRunInput): Promise<StoredReleaseRun> {
    const run = ReleaseRunInputSchema.parse(input)
    const result = await this.pool.query<Row>(
      `INSERT INTO release_runs (project_id, action, actor, actor_role, plan_hash, plan, status, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        run.projectId,
        run.action,
        run.actor,
        run.role,
        run.planHash,
        run.plan,
        run.status,
        run.result,
      ],
    )
    return toRun(result.rows[0] as Row)
  }

  async list(filter: ReleaseRunFilter): Promise<StoredReleaseRun[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT)
    const result = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM release_runs
       WHERE project_id = $1 AND ($2::text IS NULL OR action = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [filter.projectId, filter.action ?? null, limit],
    )
    return result.rows.map(toRun)
  }
}
