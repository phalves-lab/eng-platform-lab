import type { FlowCategory } from '@lab/contracts'
import type { FlowDataset, FlowIssue, FlowStatusChange } from './model.js'
import type { Workflow } from './workflow.js'

export interface Segment {
  category: FlowCategory
  from: number
  to: number | null
}

/** One issue replayed through its transitions, in workflow categories. */
export interface Timeline {
  issue: FlowIssue
  segments: Segment[]
  category: FlowCategory
  createdAt: number
  startedAt: number | null
  doneAt: number | null
}

const STARTED: ReadonlySet<FlowCategory> = new Set(['in_progress', 'review', 'blocked', 'done'])

/**
 * Unknown statuses count as `todo`, so a missing workflow entry never inflates WIP or
 * deliveries; the collector logs them to be mapped.
 */
const categoryOf = (workflow: Workflow, project: string, status: string | null): FlowCategory =>
  (status === null ? null : workflow.classify(project, status)) ?? 'todo'

const replay = (issue: FlowIssue, changes: FlowStatusChange[], workflow: Workflow): Timeline => {
  const createdAt = Date.parse(issue.createdAt)
  const untracked = changes.length === 0 && issue.resolvedAt === null
  const initial = changes[0]?.fromStatus ?? (untracked ? issue.status : null)
  let current: Segment = {
    category: categoryOf(workflow, issue.project, initial),
    from: createdAt,
    to: null,
  }
  const segments: Segment[] = [current]
  const moveTo = (category: FlowCategory, at: number) => {
    if (category === current.category) return
    current.to = at
    current = { category, from: at, to: null }
    segments.push(current)
  }
  for (const change of changes) {
    moveTo(
      categoryOf(workflow, issue.project, change.toStatus),
      Math.max(Date.parse(change.changedAt), current.from),
    )
  }
  const resolvedAt = issue.resolvedAt === null ? current.from : Date.parse(issue.resolvedAt)
  moveTo(categoryOf(workflow, issue.project, issue.status), Math.max(resolvedAt, current.from))
  const doneAt = current.category === 'done' ? current.from : null
  const started = segments.find((segment) => STARTED.has(segment.category))
  return {
    issue,
    segments,
    category: current.category,
    createdAt,
    startedAt: started?.from ?? null,
    doneAt,
  }
}

/** Replays every issue of the dataset, epics included, in key order. */
export const buildTimelines = (
  dataset: Pick<FlowDataset, 'issues' | 'changes'>,
  workflow: Workflow,
) => {
  const byIssue = new Map<string, FlowStatusChange[]>()
  for (const change of dataset.changes) {
    const list = byIssue.get(change.issueKey) ?? []
    list.push(change)
    byIssue.set(change.issueKey, list)
  }
  return dataset.issues.map((issue) =>
    replay(
      issue,
      (byIssue.get(issue.key) ?? []).toSorted(
        (a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt),
      ),
      workflow,
    ),
  )
}

/** Category of the issue at `time`, or null when it did not exist yet. */
export const categoryAt = (timeline: Timeline, time: number): FlowCategory | null => {
  if (time < timeline.createdAt) return null
  for (const segment of timeline.segments) {
    if (time >= segment.from && (segment.to === null || time < segment.to)) return segment.category
  }
  return timeline.segments.at(-1)?.category ?? null
}

/** Milliseconds the issue spent in `category` between `from` and `to`. */
export const timeIn = (timeline: Timeline, category: FlowCategory, from: number, to: number) =>
  timeline.segments
    .filter((segment) => segment.category === category)
    .reduce((total, segment) => {
      const start = Math.max(segment.from, from)
      const end = Math.min(segment.to ?? to, to)
      return end > start ? total + end - start : total
    }, 0)
