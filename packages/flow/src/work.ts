import type { BlockedByMe, FlowCategory, FlowItem, WorkItem } from '@lab/contracts'
import { DAY_MS, type FlowIssue, type FlowStatusChange, isEpic } from './model.js'
import type { Workflow } from './workflow.js'

export interface WorkIssue extends FlowIssue {
  assignee: string | null
}

/** `blockedKey` waits on `blockerKey`, as in the Jira "is blocked by" link. */
export interface WorkLink {
  blockedKey: string
  blockerKey: string
}

export interface WorkDataset {
  issues: WorkIssue[]
  changes: FlowStatusChange[]
  links: WorkLink[]
}

export interface OpenWorkItem extends WorkItem {
  assignee: string | null
}

export interface WorkInput {
  dataset: WorkDataset
  workflow: Workflow
  now: Date
  staleAfterBusinessDays: number
}

export interface MyTasks {
  inProgress: OpenWorkItem[]
  review: OpenWorkItem[]
  blocked: OpenWorkItem[]
  stale: OpenWorkItem[]
}

export interface WorkLoad {
  inProgress: number
  review: number
  blocked: number
  stale: number
}

const OPEN: ReadonlySet<FlowCategory> = new Set(['in_progress', 'review', 'blocked'])
const EPOCH_WEEKDAY = 4

const isWeekend = (dayIndex: number) => {
  const weekday = (((EPOCH_WEEKDAY + dayIndex) % 7) + 7) % 7
  return weekday === 0 || weekday === 6
}

const weekdaysBefore = (dayIndex: number) => {
  const weeks = Math.floor(dayIndex / 7)
  let total = weeks * 5
  for (let index = weeks * 7; index < dayIndex; index += 1) if (!isWeekend(index)) total += 1
  return total
}

const weekdayMsUntil = (time: number) => {
  const dayIndex = Math.floor(time / DAY_MS)
  const partial = isWeekend(dayIndex) ? 0 : time - dayIndex * DAY_MS
  return weekdaysBefore(dayIndex) * DAY_MS + partial
}

/**
 * Business days between two instants, with fractions: only Monday to Friday time counts, in UTC
 * and without holidays, the same yardstick as the review queue.
 */
export const businessDaysBetween = (from: number, to: number): number =>
  to <= from ? 0 : (weekdayMsUntil(to) - weekdayMsUntil(from)) / DAY_MS

const normalizeAccount = (account: string) => account.trim().toLocaleLowerCase('pt-BR')

/** Jira assignees and GitHub logins compare without case or surrounding spaces. */
export const sameAccount = (a: string | null, b: string | null) =>
  a !== null && b !== null && normalizeAccount(a) === normalizeAccount(b)

const categoryOf = (workflow: Workflow, issue: Pick<FlowIssue, 'project' | 'status'>) =>
  workflow.classify(issue.project, issue.status) ?? 'todo'

const toFlowItem = (issue: FlowIssue, category: FlowCategory): FlowItem => ({
  key: issue.key,
  summary: issue.summary,
  url: issue.url,
  project: issue.project,
  component: issue.component,
  status: issue.status,
  category,
})

const lastMoves = (changes: FlowStatusChange[]) => {
  const latest = new Map<string, number>()
  for (const change of changes) {
    const at = Date.parse(change.changedAt)
    if (at > (latest.get(change.issueKey) ?? Number.NEGATIVE_INFINITY)) {
      latest.set(change.issueKey, at)
    }
  }
  return latest
}

const roundTenth = (value: number) => Math.round(value * 10) / 10

/**
 * Open items (in progress, in review or blocked), epics left out, oldest move first. An item is
 * stale when its last status change, or its creation without one, is more than
 * `staleAfterBusinessDays` business days old.
 */
export const openWork = ({
  dataset,
  workflow,
  now,
  staleAfterBusinessDays,
}: WorkInput): OpenWorkItem[] => {
  const moves = lastMoves(dataset.changes)
  const until = now.getTime()
  return dataset.issues
    .flatMap((issue): OpenWorkItem[] => {
      const category = categoryOf(workflow, issue)
      if (isEpic(issue) || !OPEN.has(category)) return []
      const since = Math.min(moves.get(issue.key) ?? Date.parse(issue.createdAt), until)
      const idle = roundTenth(businessDaysBetween(since, until))
      return [
        {
          ...toFlowItem(issue, category),
          since: new Date(since).toISOString(),
          idleBusinessDays: idle,
          stale: idle > staleAfterBusinessDays,
          assignee: issue.assignee,
        },
      ]
    })
    .sort((a, b) => a.since.localeCompare(b.since) || a.key.localeCompare(b.key))
}

/** One person's open items by situation; stale items also stay in their situation. */
export const myTasks = (items: OpenWorkItem[], account: string): MyTasks => {
  const mine = items.filter((item) => sameAccount(item.assignee, account))
  return {
    inProgress: mine.filter((item) => item.category === 'in_progress'),
    review: mine.filter((item) => item.category === 'review'),
    blocked: mine.filter((item) => item.category === 'blocked'),
    stale: mine.filter((item) => item.stale),
  }
}

export const workLoad = (items: OpenWorkItem[], account: string): WorkLoad => {
  const tasks = myTasks(items, account)
  return {
    inProgress: tasks.inProgress.length,
    review: tasks.review.length,
    blocked: tasks.blocked.length,
    stale: tasks.stale.length,
  }
}

/**
 * Other people's unfinished items that wait on an unfinished item assigned to `account`. A link
 * whose blocker is already done no longer blocks anyone.
 */
export const blockedByAccount = (
  dataset: WorkDataset,
  workflow: Workflow,
  account: string,
): BlockedByMe[] => {
  const byKey = new Map(dataset.issues.map((issue) => [issue.key, issue]))
  return dataset.links
    .flatMap((link): BlockedByMe[] => {
      const blocked = byKey.get(link.blockedKey)
      const blocker = byKey.get(link.blockerKey)
      if (!blocked || !blocker || !sameAccount(blocker.assignee, account)) return []
      const blockedCategory = categoryOf(workflow, blocked)
      const blockerCategory = categoryOf(workflow, blocker)
      if (blockedCategory === 'done' || blockerCategory === 'done') return []
      if (sameAccount(blocked.assignee, account)) return []
      return [
        {
          ...toFlowItem(blocked, blockedCategory),
          assignee: blocked.assignee,
          blocker: toFlowItem(blocker, blockerCategory),
        },
      ]
    })
    .sort((a, b) => a.key.localeCompare(b.key) || a.blocker.key.localeCompare(b.blocker.key))
}
