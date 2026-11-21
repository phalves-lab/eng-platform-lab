import type pg from 'pg'
import { withTransaction } from './client.js'
import { toIso, toIsoOrNull } from './rows.js'
import {
  type JiraIssue,
  JiraIssueSchema,
  type JiraSprint,
  JiraSprintSchema,
  type JiraStatusChange,
  JiraStatusChangeSchema,
} from './schemas.js'

interface IssueRow {
  key: string
  project: string
  component: string | null
  issue_type: string
  status: string
  epic_key: string | null
  sprint_id: string | null
  assignee: string | null
  created_at: Date
  resolved_at: Date | null
}

interface SprintRow {
  id: string
  project: string
  name: string
  state: JiraSprint['state']
  starts_at: Date | null
  ends_at: Date | null
  completed_at: Date | null
}

interface StatusChangeRow {
  issue_key: string
  from_status: string | null
  to_status: string
  changed_at: Date
}

const toIssue = (row: IssueRow): JiraIssue => ({
  key: row.key,
  project: row.project,
  component: row.component,
  issueType: row.issue_type,
  status: row.status,
  epicKey: row.epic_key,
  sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
  assignee: row.assignee,
  createdAt: toIso(row.created_at),
  resolvedAt: toIsoOrNull(row.resolved_at),
})

const toSprint = (row: SprintRow): JiraSprint => ({
  id: Number(row.id),
  project: row.project,
  name: row.name,
  state: row.state,
  startsAt: toIsoOrNull(row.starts_at),
  endsAt: toIsoOrNull(row.ends_at),
  completedAt: toIsoOrNull(row.completed_at),
})

/** Mirror of Jira issues, sprints and status transitions used by flow metrics. */
export class JiraRepository {
  constructor(private readonly pool: pg.Pool) {}

  async upsertSprints(input: JiraSprint[]): Promise<void> {
    const sprints = input.map((sprint) => JiraSprintSchema.parse(sprint))
    await withTransaction(this.pool, async (client) => {
      for (const sprint of sprints) {
        await client.query(
          `INSERT INTO jira_sprints (id, project, name, state, starts_at, ends_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET project = EXCLUDED.project, name = EXCLUDED.name,
             state = EXCLUDED.state, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
             completed_at = EXCLUDED.completed_at`,
          [
            sprint.id,
            sprint.project,
            sprint.name,
            sprint.state,
            sprint.startsAt,
            sprint.endsAt,
            sprint.completedAt,
          ],
        )
      }
    })
  }

  async upsertIssues(input: JiraIssue[]): Promise<void> {
    const issues = input.map((issue) => JiraIssueSchema.parse(issue))
    await withTransaction(this.pool, async (client) => {
      for (const issue of issues) {
        await client.query(
          `INSERT INTO jira_issues
             (key, project, component, issue_type, status, epic_key, sprint_id, assignee,
              created_at, resolved_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
           ON CONFLICT (key) DO UPDATE SET project = EXCLUDED.project,
             component = EXCLUDED.component, issue_type = EXCLUDED.issue_type,
             status = EXCLUDED.status, epic_key = EXCLUDED.epic_key,
             sprint_id = EXCLUDED.sprint_id, assignee = EXCLUDED.assignee,
             created_at = EXCLUDED.created_at, resolved_at = EXCLUDED.resolved_at,
             synced_at = now()`,
          [
            issue.key,
            issue.project,
            issue.component,
            issue.issueType,
            issue.status,
            issue.epicKey,
            issue.sprintId,
            issue.assignee,
            issue.createdAt,
            issue.resolvedAt,
          ],
        )
      }
    })
  }

  /** Inserts transitions not seen before and returns how many were new. */
  async addStatusChanges(input: JiraStatusChange[]): Promise<number> {
    const changes = input.map((change) => JiraStatusChangeSchema.parse(change))
    return withTransaction(this.pool, async (client) => {
      let inserted = 0
      for (const change of changes) {
        const result = await client.query(
          `INSERT INTO jira_status_changes (issue_key, from_status, to_status, changed_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (issue_key, changed_at, to_status) DO NOTHING`,
          [change.issueKey, change.fromStatus, change.toStatus, change.changedAt],
        )
        inserted += result.rowCount ?? 0
      }
      return inserted
    })
  }

  async findIssue(key: string): Promise<JiraIssue | null> {
    const result = await this.pool.query<IssueRow>('SELECT * FROM jira_issues WHERE key = $1', [
      key,
    ])
    const row = result.rows[0]
    return row ? toIssue(row) : null
  }

  async findSprint(id: number): Promise<JiraSprint | null> {
    const result = await this.pool.query<SprintRow>('SELECT * FROM jira_sprints WHERE id = $1', [
      id,
    ])
    const row = result.rows[0]
    return row ? toSprint(row) : null
  }

  async statusChanges(issueKey: string): Promise<JiraStatusChange[]> {
    const result = await this.pool.query<StatusChangeRow>(
      `SELECT issue_key, from_status, to_status, changed_at FROM jira_status_changes
       WHERE issue_key = $1 ORDER BY changed_at, id`,
      [issueKey],
    )
    return result.rows.map((row) => ({
      issueKey: row.issue_key,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: toIso(row.changed_at),
    }))
  }
}
