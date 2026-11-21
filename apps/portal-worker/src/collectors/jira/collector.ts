import type { JiraRepository } from '@lab/database'
import { type Workflow, unmappedStatuses } from '@lab/flow'
import type { Collector } from '../../collector.js'
import type { JiraBatch, JiraSource } from './source.js'

export interface JiraCollectorOptions {
  source: JiraSource
  repository: Pick<
    JiraRepository,
    'upsertSprints' | 'upsertIssues' | 'addStatusChanges' | 'upsertSprintIssues'
  >
  workflow: Workflow
  intervalMs: number
}

/** Drops links to sprints and issues outside the batch, which the foreign keys would reject. */
export const consistentBatch = (batch: JiraBatch): JiraBatch => {
  const sprints = new Set(batch.sprints.map((sprint) => sprint.id))
  const keys = new Set(batch.issues.map((issue) => issue.key))
  return {
    sprints: batch.sprints,
    issues: batch.issues.map((issue) =>
      issue.sprintId !== null && !sprints.has(issue.sprintId)
        ? { ...issue, sprintId: null }
        : issue,
    ),
    changes: batch.changes.filter((change) => keys.has(change.issueKey)),
    sprintIssues: batch.sprintIssues.filter(
      (entry) => sprints.has(entry.sprintId) && keys.has(entry.issueKey),
    ),
  }
}

/** Mirrors the Jira board into Postgres with idempotent upserts; it never writes to Jira. */
export const createJiraCollector = (options: JiraCollectorOptions): Collector => ({
  name: 'jira',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const batch = consistentBatch(await options.source.fetch(now))
    await options.repository.upsertSprints(batch.sprints)
    await options.repository.upsertIssues(batch.issues)
    const newChanges = await options.repository.addStatusChanges(batch.changes)
    await options.repository.upsertSprintIssues(batch.sprintIssues)

    const projectOf = new Map(batch.issues.map((issue) => [issue.key, issue.project]))
    const unmapped = unmappedStatuses(options.workflow, [
      ...batch.issues,
      ...batch.changes.map((change) => ({
        project: projectOf.get(change.issueKey) ?? '',
        status: change.toStatus,
      })),
    ])
    if (unmapped.length) logger.warn('jira.unmapped_statuses', { statuses: unmapped })
    logger.info('jira.synced', {
      source: options.source.kind,
      sprints: batch.sprints.length,
      issues: batch.issues.length,
      newChanges,
      sprintIssues: batch.sprintIssues.length,
    })
  },
})
