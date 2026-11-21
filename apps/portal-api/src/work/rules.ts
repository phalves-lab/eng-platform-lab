import type {
  MyJiraWork,
  MyPullRequest,
  MyReviewWork,
  ReviewRequest,
  WorkAlert,
  WorkItem,
} from '@lab/contracts'
import type { QueueRow } from '@lab/eng-metrics/contract'
import type { OpenWorkItem } from '@lab/flow'
import type { MyQueue } from '../review/my-queue.js'

const CHANGES_REQUESTED: ReadonlySet<MyPullRequest['status']['kind']> = new Set([
  'bot_changes',
  'reviewed',
])

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatBusinessDays = (days: number) =>
  `${decimal.format(days)} ${days >= 2 ? 'dias úteis' : 'dia útil'}`

export const toWorkItem = (item: OpenWorkItem): WorkItem => ({
  key: item.key,
  summary: item.summary,
  url: item.url,
  project: item.project,
  component: item.component,
  status: item.status,
  category: item.category,
  since: item.since,
  idleBusinessDays: item.idleBusinessDays,
  stale: item.stale,
})

const toReviewRequest = (row: QueueRow): ReviewRequest => ({
  position: row.position,
  number: row.number,
  title: row.title,
  url: row.url,
  author: row.author,
  ageBusinessDays: row.ageBusinessDays,
  level: row.level,
  lines: row.lines,
})

/**
 * The review side of the personal page. A PR has changes requested when the bot asked for
 * adjustments or a human review came back and nobody was asked again.
 */
export const reviewWork = (dataset: string, github: string, queue: MyQueue): MyReviewWork => {
  const mine = queue.mine.map(({ row, status }): MyPullRequest => ({
    number: row.number,
    title: row.title,
    url: row.url,
    status,
  }))
  return {
    state: 'ready',
    dataset,
    github,
    toReview: queue.toReview.map(toReviewRequest),
    mine,
    changesRequested: mine.filter((pr) => CHANGES_REQUESTED.has(pr.status.kind)),
  }
}

const ownerSuffix = (assignee: string | null) => (assignee ? ` de ${assignee}` : '')

const SEVERITY_ORDER = { alta: 0, media: 1 } as const

/** What needs attention today, most severe first; a blocked item does not repeat as stale. */
export const workAlerts = (jira: MyJiraWork, review: MyReviewWork): WorkAlert[] => {
  const alerts: WorkAlert[] = []
  if (jira.state === 'ready') {
    for (const item of jira.blockedByMe) {
      alerts.push({
        kind: 'blocking_others',
        severity: 'alta',
        message: `${item.blocker.key} segura ${item.key}${ownerSuffix(item.assignee)}.`,
        url: item.blocker.url,
      })
    }
    for (const item of jira.blocked) {
      alerts.push({
        kind: 'blocked_task',
        severity: 'alta',
        message: `${item.key} está bloqueada há ${formatBusinessDays(item.idleBusinessDays)}.`,
        url: item.url,
      })
    }
    for (const item of jira.stale.filter((task) => task.category !== 'blocked')) {
      alerts.push({
        kind: 'stale_task',
        severity: 'media',
        message: `${item.key} está parada em ${item.status} há ${formatBusinessDays(item.idleBusinessDays)}.`,
        url: item.url,
      })
    }
  }
  if (review.state === 'ready') {
    for (const row of review.toReview.filter((request) => request.level === 'atrasado')) {
      alerts.push({
        kind: 'late_review',
        severity: 'alta',
        message: `PR #${row.number} de ${row.author} espera sua review há ${formatBusinessDays(row.ageBusinessDays)}.`,
        url: row.url,
      })
    }
    for (const pr of review.mine.filter((item) => item.status.kind === 'failing_checks')) {
      alerts.push({
        kind: 'failing_checks',
        severity: 'media',
        message: `PR #${pr.number} está com check vermelho.`,
        url: pr.url,
      })
    }
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
