import { isBot } from './github.js'
import type { PanelData, PanelDataset, QueueRow, WeeklyPoint } from './contract.js'
import {
  buildAlerts,
  buildMetrics,
  buildQueue,
  hoursToFirstReview,
  type QueueItem,
} from './metrics.js'
import { median } from './time.js'
import type { Dataset, PullRequest } from './types.js'

const DAY_MS = 86_400_000

const toQueueRow = (item: QueueItem, index: number): QueueRow => ({
  position: index + 1,
  number: item.pr.number,
  title: item.pr.title,
  url: item.pr.url,
  author: item.pr.author,
  taskKey: item.pr.taskKey,
  taskStatus: item.task?.status ?? null,
  requestedReviewers: item.pr.requestedReviewers,
  reviewedBy: [
    ...new Set(item.pr.reviews.map((review) => review.author).filter((author) => !isBot(author))),
  ],
  enteredAt: item.enteredAt,
  enteredFrom: item.enteredFrom,
  ageBusinessDays: item.ageBusinessDays,
  level: item.level,
  hasHumanReview: item.hasHumanReview,
  checks: item.pr.checks,
  botSignal: item.pr.botSignal,
  risks: item.pr.labels.filter((label) => label.startsWith('risk:')),
  lines: item.pr.additions + item.pr.deletions,
})

const startOfWeek = (iso: string): number => {
  const date = new Date(iso)
  const day = (date.getUTCDay() + 6) % 7
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS
}

/** Série semanal (segunda a domingo, UTC) dos PRs mergeados, da semana mais antiga à atual. */
export const buildTrend = (prs: PullRequest[], now: string, weeks = 8): WeeklyPoint[] => {
  const current = startOfWeek(now)
  return Array.from({ length: weeks }, (_, index) => {
    const start = current - (weeks - 1 - index) * 7 * DAY_MS
    const merged = prs.filter((pr) => {
      if (pr.state !== 'MERGED' || !pr.mergedAt) return false
      const at = new Date(pr.mergedAt).getTime()
      return at >= start && at < start + 7 * DAY_MS
    })
    return {
      weekStart: new Date(start).toISOString(),
      merged: merged.length,
      medianHoursToFirstReview: median(
        merged.flatMap((pr) => {
          const hours = hoursToFirstReview(pr)
          return hours === null ? [] : [hours]
        }),
      ),
      medianSize: median(merged.map((pr) => pr.additions + pr.deletions)),
    }
  })
}

export interface DatasetSource {
  id: string
  title: string
  dataset: Dataset
}

const toPanelDataset = ({ id, title, dataset }: DatasetSource): PanelDataset => {
  const { pullRequests, tasks, generatedAt } = dataset
  return {
    id,
    title,
    label: dataset.label,
    generatedAt,
    queue: buildQueue(pullRequests, tasks, generatedAt).map(toQueueRow),
    alerts: buildAlerts(pullRequests, tasks, generatedAt),
    metrics: buildMetrics(pullRequests, generatedAt),
    trend: buildTrend(pullRequests, generatedAt),
  }
}

/** Monta o `data.json` do painel já com fila, alertas e métricas calculados. */
export const buildPanelData = (sources: DatasetSource[], generatedAt: string): PanelData => ({
  schemaVersion: 1,
  generatedAt,
  datasets: sources.map(toPanelDataset),
})
