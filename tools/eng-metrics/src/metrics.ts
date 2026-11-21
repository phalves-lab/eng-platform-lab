import { isBot } from './github.js'
import { businessDaysBetween, daysAgo, hoursBetween, median } from './time.js'
import type { Alert, QueueLevel, ReviewerLoad, TeamMetrics } from './contract.js'
import type { PullRequest, TaskStatus } from './types.js'

export const REVIEW_STATUSES = ['code review', 'em code review', 'revisão', 'em revisão', 'review']
const DONE_STATUSES = ['concluída', 'concluido', 'concluído', 'done', 'fechada', 'homologação']
const IN_PROGRESS_STATUSES = ['em andamento', 'in progress', 'desenvolvimento']
const READY_STATUSES = ['pronta', 'to do', 'a fazer']

export const QUEUE_THRESHOLDS = { attention: 1, late: 3 } as const
export const LARGE_PR_LINES = 400

const normalize = (status: string) => status.trim().toLowerCase()
const decimal = (value: number) => value.toFixed(1).replace('.', ',')
const isOneOf = (status: string, list: string[]) => list.includes(normalize(status))

const humanReviews = (pr: PullRequest) => pr.reviews.filter((r) => !isBot(r.author))

export interface QueueItem {
  pr: PullRequest
  task: TaskStatus | null
  enteredAt: string
  enteredFrom: 'jira' | 'pr'
  ageBusinessDays: number
  level: QueueLevel
  hasHumanReview: boolean
}

const enteredReviewAt = (task: TaskStatus | null): string | null => {
  const changes = (task?.statusHistory ?? []).filter((c) => isOneOf(c.status, REVIEW_STATUSES))
  return changes.at(-1)?.at ?? null
}

/**
 * Fila de review na ordem em que cada item entrou em code review: primeiro pela transição no
 * board do Jira; sem ela, pelo momento em que o PR ficou pronto para review.
 */
export const buildQueue = (prs: PullRequest[], tasks: TaskStatus[], now: string): QueueItem[] =>
  prs
    .filter((pr) => pr.state === 'OPEN' && !pr.isDraft)
    .map((pr) => {
      const task = tasks.find((t) => t.key === pr.taskKey) ?? null
      const fromJira = enteredReviewAt(task)
      const enteredAt = fromJira ?? pr.readyAt
      const age = businessDaysBetween(enteredAt, now)
      const level: QueueLevel =
        age > QUEUE_THRESHOLDS.late
          ? 'atrasado'
          : age > QUEUE_THRESHOLDS.attention
            ? 'atencao'
            : 'ok'
      return {
        pr,
        task,
        enteredAt,
        enteredFrom: fromJira ? ('jira' as const) : ('pr' as const),
        ageBusinessDays: age,
        level,
        hasHumanReview: humanReviews(pr).length > 0,
      }
    })
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))

const isDependencyBot = (pr: PullRequest) =>
  isBot(pr.author) || pr.headRef.startsWith('dependabot/')

export const buildAlerts = (prs: PullRequest[], tasks: TaskStatus[], now: string): Alert[] => {
  const alerts: Alert[] = []
  const queue = buildQueue(prs, tasks, now)

  for (const item of queue) {
    const { pr } = item
    if (!item.hasHumanReview && item.ageBusinessDays > 2) {
      alerts.push({
        kind: 'Review parado',
        severity: 'alta',
        subject: `#${pr.number}`,
        message: `PR #${pr.number} aguarda a primeira review há ${decimal(item.ageBusinessDays)} dias úteis.`,
        url: pr.url,
      })
    }
    if (pr.checks === 'FAILURE' || pr.checks === 'ERROR') {
      alerts.push({
        kind: 'Check vermelho',
        severity: 'media',
        subject: `#${pr.number}`,
        message: `PR #${pr.number} está com check falhando.`,
        url: pr.url,
      })
    }
    if (!pr.taskKey && !isDependencyBot(pr)) {
      alerts.push({
        kind: 'PR sem task',
        severity: 'media',
        subject: `#${pr.number}`,
        message: `PR #${pr.number} não tem chave de task na branch nem no título.`,
        url: pr.url,
      })
    }
    if (pr.additions + pr.deletions > LARGE_PR_LINES && !isDependencyBot(pr)) {
      alerts.push({
        kind: 'PR grande',
        severity: 'media',
        subject: `#${pr.number}`,
        message: `PR #${pr.number} altera ${pr.additions + pr.deletions} linhas (inclui lockfile, se houver).`,
        url: pr.url,
      })
    }
    if (pr.botSignal === 'ajustes') {
      alerts.push({
        kind: 'Bot pediu ajustes',
        severity: 'media',
        subject: `#${pr.number}`,
        message: `PR #${pr.number}: o review de IA recomenda ajustes antes da revisão humana.`,
        url: pr.url,
      })
    }
  }

  for (const task of tasks) {
    const linked = prs.filter((pr) => pr.taskKey === task.key)
    const active =
      isOneOf(task.status, IN_PROGRESS_STATUSES) || isOneOf(task.status, READY_STATUSES)
    if (active && task.acceptanceCriteria === 0) {
      alerts.push({
        kind: 'Task sem critério de aceite',
        severity: 'alta',
        subject: task.key,
        message: `${task.key} está em "${task.status}" sem critério de aceite (RN-05).`,
        url: null,
      })
    }
    const startedAt = task.statusHistory
      .filter((c) => isOneOf(c.status, IN_PROGRESS_STATUSES))
      .at(-1)?.at
    if (isOneOf(task.status, IN_PROGRESS_STATUSES) && startedAt && linked.length === 0) {
      const age = businessDaysBetween(startedAt, now)
      if (age > 3) {
        alerts.push({
          kind: 'Task sem PR',
          severity: 'media',
          subject: task.key,
          message: `${task.key} está em andamento há ${decimal(age)} dias úteis sem PR vinculado.`,
          url: null,
        })
      }
    }
    const merged = linked.filter((pr) => pr.state === 'MERGED')
    const open = linked.filter((pr) => pr.state === 'OPEN')
    if (merged.length && !open.length && !isOneOf(task.status, DONE_STATUSES)) {
      alerts.push({
        kind: 'PR mergeado com task parada',
        severity: 'media',
        subject: task.key,
        message: `${task.key} teve PR mergeado e continua em "${task.status}" no board.`,
        url: merged.at(-1)?.url ?? null,
      })
    }
  }

  const order = { alta: 0, media: 1 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}

/** Horas entre o PR ficar pronto e a primeira review de uma pessoa (bots não contam). */
export const hoursToFirstReview = (pr: PullRequest): number | null => {
  const first = humanReviews(pr)
    .map((r) => r.submittedAt)
    .sort()[0]
  return first ? hoursBetween(pr.readyAt, first) : null
}

export const buildMetrics = (prs: PullRequest[], now: string, windowDays = 30): TeamMetrics => {
  const since = daysAgo(now, windowDays)
  const merged = prs.filter((pr) => pr.state === 'MERGED' && pr.mergedAt && pr.mergedAt >= since)
  const recent = prs.filter((pr) => pr.readyAt >= since)

  const firstReviewHours = merged.flatMap((pr) => {
    const hours = hoursToFirstReview(pr)
    return hours === null ? [] : [hours]
  })

  const signals = { ajustes: 0, gate: 0, pronto: 0, sem_comentario: 0 }
  for (const pr of recent) signals[pr.botSignal ?? 'sem_comentario'] += 1

  const loads = new Map<string, ReviewerLoad & { prs: Set<number> }>()
  const pairs = new Map<string, number>()
  for (const pr of prs) {
    for (const review of humanReviews(pr)) {
      if (review.submittedAt < since) continue
      const load = loads.get(review.author) ?? {
        reviewer: review.author,
        reviews: 0,
        pullRequests: 0,
        comments: 0,
        prs: new Set<number>(),
      }
      load.reviews += 1
      load.comments += review.comments
      load.prs.add(pr.number)
      loads.set(review.author, load)
      const pair = `${pr.author}>${review.author}`
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
    }
  }

  return {
    windowDays,
    merged: merged.length,
    medianHoursToFirstReview: median(firstReviewHours),
    medianBusinessDaysToMerge: median(
      merged.map((pr) => businessDaysBetween(pr.readyAt, pr.mergedAt ?? pr.readyAt)),
    ),
    medianSize: median(merged.map((pr) => pr.additions + pr.deletions)),
    mergedWithFailingChecks: merged.filter((pr) => pr.checks === 'FAILURE' || pr.checks === 'ERROR')
      .length,
    signals,
    reviewers: [...loads.values()]
      .map(({ prs: set, ...load }) => ({ ...load, pullRequests: set.size }))
      .sort((a, b) => b.reviews - a.reviews || b.comments - a.comments),
    pairs: [...pairs.entries()]
      .map(([key, count]) => {
        const [author = '', reviewer = ''] = key.split('>')
        return { author, reviewer, count }
      })
      .sort((a, b) => b.count - a.count),
  }
}
