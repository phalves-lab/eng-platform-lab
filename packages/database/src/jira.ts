import type pg from 'pg'
import { withTransaction } from './client.js'
import { toIso, toIsoOrNull } from './rows.js'
import {
  type JiraIssue,
  type JiraIssueLink,
  JiraIssueLinkSchema,
  JiraIssueSchema,
  type JiraSprint,
  type JiraSprintIssue,
  JiraSprintIssueSchema,
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
  summary: string | null
  url: string | null
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

interface SprintIssueRow {
  sprint_id: string
  issue_key: string
  added_at: Date | null
}

interface IssueLinkRow {
  blocked_key: string
  blocker_key: string
}

/** Narrows every read to one Jira project when set. */
export interface JiraProjectFilter {
  project?: string
}

const toIssue = (row: IssueRow): JiraIssue => ({
  key: row.key,
  project: row.project,
  component: row.component,
  issueType: row.issue_type,
  status: row.status,
  summary: row.summary,
  url: row.url,
  epicKey: row.epic_key,
  sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
  assignee: row.assignee,
  createdAt: toIso(row.created_at),
  resolvedAt: toIsoOrNull(row.resolved_at),
})

const toStatusChange = (row: StatusChangeRow): JiraStatusChange => ({
  issueKey: row.issue_key,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  changedAt: toIso(row.changed_at),
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
              created_at, resolved_at, summary, url, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
           ON CONFLICT (key) DO UPDATE SET project = EXCLUDED.project,
             component = EXCLUDED.component, issue_type = EXCLUDED.issue_type,
             status = EXCLUDED.status, epic_key = EXCLUDED.epic_key,
             summary = EXCLUDED.summary, url = EXCLUDED.url,
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
            issue.summary,
            issue.url,
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
    return result.rows.map(toStatusChange)
  }

  /** Records which sprints each issue was part of and when it entered each one. */
  async upsertSprintIssues(input: JiraSprintIssue[]): Promise<void> {
    const entries = input.map((entry) => JiraSprintIssueSchema.parse(entry))
    await withTransaction(this.pool, async (client) => {
      for (const entry of entries) {
        await client.query(
          `INSERT INTO jira_sprint_issues (sprint_id, issue_key, added_at) VALUES ($1, $2, $3)
           ON CONFLICT (sprint_id, issue_key) DO UPDATE SET added_at = EXCLUDED.added_at`,
          [entry.sprintId, entry.issueKey, entry.addedAt],
        )
      }
    })
  }

  async listProjects(): Promise<string[]> {
    const result = await this.pool.query<{ project: string }>(
      'SELECT DISTINCT project FROM jira_issues ORDER BY project',
    )
    return result.rows.map((row) => row.project)
  }

  async listIssues(filter: JiraProjectFilter = {}): Promise<JiraIssue[]> {
    const result = await this.pool.query<IssueRow>(
      `SELECT * FROM jira_issues WHERE ($1::text IS NULL OR project = $1) ORDER BY key`,
      [filter.project ?? null],
    )
    return result.rows.map(toIssue)
  }

  async listStatusChanges(filter: JiraProjectFilter = {}): Promise<JiraStatusChange[]> {
    const result = await this.pool.query<StatusChangeRow>(
      `SELECT c.issue_key, c.from_status, c.to_status, c.changed_at
       FROM jira_status_changes c JOIN jira_issues i ON i.key = c.issue_key
       WHERE ($1::text IS NULL OR i.project = $1)
       ORDER BY c.issue_key, c.changed_at, c.id`,
      [filter.project ?? null],
    )
    return result.rows.map(toStatusChange)
  }

  async listSprints(filter: JiraProjectFilter = {}): Promise<JiraSprint[]> {
    const result = await this.pool.query<SprintRow>(
      `SELECT * FROM jira_sprints WHERE ($1::text IS NULL OR project = $1)
       ORDER BY starts_at NULLS LAST, id`,
      [filter.project ?? null],
    )
    return result.rows.map(toSprint)
  }

  async listSprintIssues(filter: JiraProjectFilter = {}): Promise<JiraSprintIssue[]> {
    const result = await this.pool.query<SprintIssueRow>(
      `SELECT m.sprint_id, m.issue_key, m.added_at
       FROM jira_sprint_issues m JOIN jira_sprints s ON s.id = m.sprint_id
       WHERE ($1::text IS NULL OR s.project = $1)
       ORDER BY m.sprint_id, m.issue_key`,
      [filter.project ?? null],
    )
    return result.rows.map((row) => ({
      sprintId: Number(row.sprint_id),
      issueKey: row.issue_key,
      addedAt: toIsoOrNull(row.added_at),
    }))
  }

  /**
   * Replaces the blocking links that touch the given issues, so a link removed in Jira also
   * leaves the mirror. Issues outside `keys` keep their links.
   */
  async replaceIssueLinks(keys: string[], input: JiraIssueLink[]): Promise<void> {
    const links = input.map((link) => JiraIssueLinkSchema.parse(link))
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `DELETE FROM jira_issue_links
         WHERE blocked_key = ANY($1::text[]) OR blocker_key = ANY($1::text[])`,
        [keys],
      )
      for (const link of links) {
        await client.query(
          `INSERT INTO jira_issue_links (blocked_key, blocker_key) VALUES ($1, $2)
           ON CONFLICT (blocked_key, blocker_key) DO UPDATE SET synced_at = now()`,
          [link.blockedKey, link.blockerKey],
        )
      }
    })
  }

  async listIssueLinks(): Promise<JiraIssueLink[]> {
    const result = await this.pool.query<IssueLinkRow>(
      'SELECT blocked_key, blocker_key FROM jira_issue_links ORDER BY blocked_key, blocker_key',
    )
    return result.rows.map((row) => ({ blockedKey: row.blocked_key, blockerKey: row.blocker_key }))
  }
}
