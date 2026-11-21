import type pg from 'pg'
import { withTransaction } from './client.js'
import { toIso, toIsoOrNull } from './rows.js'
import { type Deploy, DeploySchema, type Incident, IncidentSchema } from './schemas.js'

interface DeployRow {
  repo: string
  environment: string
  sha: string
  deployed_at: Date
  status: Deploy['status']
}

interface IncidentRow {
  id: string
  system: string
  severity: Incident['severity']
  started_at: Date
  ended_at: Date | null
}

export interface DeployFilter {
  repo?: string
  environment?: string
  since?: string
}

/** Deploy events per repository and environment, the base for DORA frequency and failure rate. */
export class DeployRepository {
  constructor(private readonly pool: pg.Pool) {}

  /** Records deploys idempotently and returns how many were new. */
  async record(input: Deploy[]): Promise<number> {
    const deploys = input.map((deploy) => DeploySchema.parse(deploy))
    return withTransaction(this.pool, async (client) => {
      let inserted = 0
      for (const deploy of deploys) {
        const result = await client.query(
          `INSERT INTO deploys (repo, environment, sha, deployed_at, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (repo, environment, sha, deployed_at) DO NOTHING`,
          [deploy.repo, deploy.environment, deploy.sha, deploy.deployedAt, deploy.status],
        )
        inserted += result.rowCount ?? 0
      }
      return inserted
    })
  }

  async list(filter: DeployFilter = {}): Promise<Deploy[]> {
    const result = await this.pool.query<DeployRow>(
      `SELECT repo, environment, sha, deployed_at, status FROM deploys
       WHERE ($1::text IS NULL OR repo = $1)
         AND ($2::text IS NULL OR environment = $2)
         AND ($3::timestamptz IS NULL OR deployed_at >= $3)
       ORDER BY deployed_at DESC, id DESC`,
      [filter.repo ?? null, filter.environment ?? null, filter.since ?? null],
    )
    return result.rows.map((row) => ({
      repo: row.repo,
      environment: row.environment,
      sha: row.sha,
      deployedAt: toIso(row.deployed_at),
      status: row.status,
    }))
  }
}

/** Production incidents, the base for DORA time to restore. */
export class IncidentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsert(input: Incident[]): Promise<void> {
    const incidents = input.map((incident) => IncidentSchema.parse(incident))
    await withTransaction(this.pool, async (client) => {
      for (const incident of incidents) {
        await client.query(
          `INSERT INTO incidents (id, system, severity, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET system = EXCLUDED.system,
             severity = EXCLUDED.severity, started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at`,
          [incident.id, incident.system, incident.severity, incident.startedAt, incident.endedAt],
        )
      }
    })
  }

  async list(since?: string): Promise<Incident[]> {
    const result = await this.pool.query<IncidentRow>(
      `SELECT id, system, severity, started_at, ended_at FROM incidents
       WHERE ($1::timestamptz IS NULL OR started_at >= $1)
       ORDER BY started_at DESC, id`,
      [since ?? null],
    )
    return result.rows.map((row) => ({
      id: row.id,
      system: row.system,
      severity: row.severity,
      startedAt: toIso(row.started_at),
      endedAt: toIsoOrNull(row.ended_at),
    }))
  }
}
