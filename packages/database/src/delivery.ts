import type pg from 'pg'
import { withTransaction } from './client.js'
import { toIso, toIsoOrNull } from './rows.js'
import {
  type Change,
  type ChangeInput,
  ChangeSchema,
  type Deploy,
  type DeployInput,
  DeploySchema,
  type Incident,
  type IncidentInput,
  IncidentSchema,
} from './schemas.js'

interface DeployRow {
  repo: string
  environment: string
  sha: string
  deployed_at: Date
  status: Deploy['status']
  url: string | null
  commit_shas: string[]
}

interface IncidentRow {
  id: string
  system: string
  severity: Incident['severity']
  started_at: Date
  ended_at: Date | null
  title: string | null
  cause_repo: string | null
  cause_sha: string | null
}

interface ChangeRow {
  repo: string
  pull_number: number
  title: string
  merge_sha: string
  first_commit_at: Date
  merged_at: Date
}

export interface DeployFilter {
  repo?: string
  environment?: string
  since?: string
}

/** Deploy events per repository and environment, the base for DORA frequency and failure rate. */
export class DeployRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Records deploys idempotently and returns how many were new or changed. A deploy seen again
   * with another status, link or commit list (a later rollback, for instance) is updated.
   */
  async record(input: DeployInput[]): Promise<number> {
    const deploys = input.map((deploy) => DeploySchema.parse(deploy))
    return withTransaction(this.pool, async (client) => {
      let written = 0
      for (const deploy of deploys) {
        const result = await client.query(
          `INSERT INTO deploys (repo, environment, sha, deployed_at, status, url, commit_shas)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (repo, environment, sha, deployed_at) DO UPDATE SET
             status = EXCLUDED.status, url = EXCLUDED.url, commit_shas = EXCLUDED.commit_shas
           WHERE (deploys.status, deploys.url, deploys.commit_shas)
             IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.url, EXCLUDED.commit_shas)`,
          [
            deploy.repo,
            deploy.environment,
            deploy.sha,
            deploy.deployedAt,
            deploy.status,
            deploy.url,
            deploy.commitShas,
          ],
        )
        written += result.rowCount ?? 0
      }
      return written
    })
  }

  async list(filter: DeployFilter = {}): Promise<Deploy[]> {
    const result = await this.pool.query<DeployRow>(
      `SELECT repo, environment, sha, deployed_at, status, url, commit_shas FROM deploys
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
      url: row.url,
      commitShas: row.commit_shas,
    }))
  }
}

/** Production incidents, the base for DORA time to restore and change failure rate. */
export class IncidentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsert(input: IncidentInput[]): Promise<void> {
    const incidents = input.map((incident) => IncidentSchema.parse(incident))
    await withTransaction(this.pool, async (client) => {
      for (const incident of incidents) {
        await client.query(
          `INSERT INTO incidents (id, system, severity, started_at, ended_at, title, cause_repo,
             cause_sha)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET system = EXCLUDED.system,
             severity = EXCLUDED.severity, started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at, title = EXCLUDED.title,
             cause_repo = EXCLUDED.cause_repo, cause_sha = EXCLUDED.cause_sha`,
          [
            incident.id,
            incident.system,
            incident.severity,
            incident.startedAt,
            incident.endedAt,
            incident.title,
            incident.cause?.repo ?? null,
            incident.cause?.sha ?? null,
          ],
        )
      }
    })
  }

  async list(since?: string): Promise<Incident[]> {
    const result = await this.pool.query<IncidentRow>(
      `SELECT id, system, severity, started_at, ended_at, title, cause_repo, cause_sha
       FROM incidents
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
      title: row.title,
      cause:
        row.cause_repo !== null && row.cause_sha !== null
          ? { repo: row.cause_repo, sha: row.cause_sha }
          : null,
    }))
  }
}

/** Merged pull requests per repository, the base for DORA lead time for changes. */
export class ChangeRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsert(input: ChangeInput[]): Promise<void> {
    const changes = input.map((change) => ChangeSchema.parse(change))
    await withTransaction(this.pool, async (client) => {
      for (const change of changes) {
        await client.query(
          `INSERT INTO delivery_changes (repo, pull_number, title, merge_sha, first_commit_at,
             merged_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (repo, pull_number) DO UPDATE SET title = EXCLUDED.title,
             merge_sha = EXCLUDED.merge_sha, first_commit_at = EXCLUDED.first_commit_at,
             merged_at = EXCLUDED.merged_at`,
          [
            change.repo,
            change.pullNumber,
            change.title,
            change.mergeSha,
            change.firstCommitAt,
            change.mergedAt,
          ],
        )
      }
    })
  }

  async list(since?: string): Promise<Change[]> {
    const result = await this.pool.query<ChangeRow>(
      `SELECT repo, pull_number, title, merge_sha, first_commit_at, merged_at
       FROM delivery_changes
       WHERE ($1::timestamptz IS NULL OR merged_at >= $1)
       ORDER BY merged_at DESC, repo, pull_number`,
      [since ?? null],
    )
    return result.rows.map((row) => ({
      repo: row.repo,
      pullNumber: row.pull_number,
      title: row.title,
      mergeSha: row.merge_sha,
      firstCommitAt: toIso(row.first_commit_at),
      mergedAt: toIso(row.merged_at),
    }))
  }
}
