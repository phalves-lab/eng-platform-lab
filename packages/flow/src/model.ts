/** Mirror rows the flow metrics read; the database repository returns them as is. */
export interface FlowIssue {
  key: string
  project: string
  component: string | null
  issueType: string
  status: string
  summary: string | null
  url: string | null
  epicKey: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface FlowStatusChange {
  issueKey: string
  fromStatus: string | null
  toStatus: string
  changedAt: string
}

export interface FlowSprint {
  id: number
  project: string
  name: string
  state: 'future' | 'active' | 'closed'
  startsAt: string | null
  endsAt: string | null
  completedAt: string | null
}

export interface FlowSprintIssue {
  sprintId: number
  issueKey: string
  addedAt: string | null
}

export interface FlowDataset {
  issues: FlowIssue[]
  changes: FlowStatusChange[]
  sprints: FlowSprint[]
  sprintIssues: FlowSprintIssue[]
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

export const isEpic = (issue: Pick<FlowIssue, 'issueType'>) =>
  issue.issueType.trim().toLowerCase() === 'epic'

export const toDays = (ms: number) => Math.round((ms / DAY_MS) * 10) / 10

/** Monday 00:00 UTC of the week that contains `time`. */
export const weekStart = (time: number): number => {
  const date = new Date(time)
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const sinceMonday = (date.getUTCDay() + 6) % 7
  return midnight - sinceMonday * DAY_MS
}
