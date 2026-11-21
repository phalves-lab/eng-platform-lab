import type {
  JiraIssue,
  JiraIssueLink,
  JiraSprint,
  JiraSprintIssue,
  JiraStatusChange,
} from '@lab/database'

/** Everything one Jira sync brings back, ready to be upserted into the mirror tables. */
export interface JiraBatch {
  sprints: JiraSprint[]
  issues: JiraIssue[]
  changes: JiraStatusChange[]
  sprintIssues: JiraSprintIssue[]
  links: JiraIssueLink[]
}

/** Read-only port over a Jira board: the fixture adapter in the lab, Jira Cloud in production. */
export interface JiraSource {
  kind: 'fixture' | 'cloud'
  fetch: (now: Date) => Promise<JiraBatch>
}

const JIRA_OFFSET = /([+-]\d{2})(\d{2})$/

/** Jira sends offsets as `-0300`; this returns the same instant as a UTC ISO string. */
export const toIsoInstant = (value: string): string => {
  const date = new Date(value.replace(JIRA_OFFSET, '$1:$2'))
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Jira date: ${value}`)
  return date.toISOString()
}

/** Removes trailing slashes from a base URL without a backtracking regex. */
export const withoutTrailingSlashes = (url: string): string => {
  let end = url.length
  while (end > 0 && url.charAt(end - 1) === '/') end -= 1
  return url.slice(0, end)
}
