import type {
  AgingItem,
  AgingLevel,
  BlockedItem,
  CycleTimeBucket,
  FlowItem,
  FlowMetricsResponse,
  FlowPercentiles,
} from '@lab/contracts'
import { type FlowDataset, WEEK_MS, isEpic, toDays, weekStart } from './model.js'
import { type Timeline, buildTimelines, timeIn } from './timeline.js'
import { type Workflow, unmappedStatuses } from './workflow.js'

const BUCKET_EDGES = [0, 1, 2, 3, 5, 8, 13, 21]
const WORK_IN_PROGRESS = new Set(['in_progress', 'review', 'blocked'])

export interface FlowMetricsInput {
  dataset: Pick<FlowDataset, 'issues' | 'changes'>
  workflow: Workflow
  now: Date
  weeks: number
  project?: string
  component?: string
}

/** Nearest-rank percentile: the smallest value with at least `p` percent of the sample at or below. */
export const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null
  const rank = Math.max(Math.ceil((p / 100) * sorted.length), 1)
  return sorted[rank - 1] ?? null
}

export const percentiles = (values: number[]): FlowPercentiles => {
  const sorted = values.toSorted((a, b) => a - b)
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p85: percentile(sorted, 85),
    p95: percentile(sorted, 95),
  }
}

/** Cycle time histogram on fixed day edges, so two periods can be compared side by side. */
export const distribution = (values: number[]): CycleTimeBucket[] =>
  BUCKET_EDGES.map((minDays, index) => {
    const maxDays = BUCKET_EDGES[index + 1] ?? null
    return {
      minDays,
      maxDays,
      count: values.filter((value) => value >= minDays && (maxDays === null || value < maxDays))
        .length,
    }
  })

export const agingLevel = (ageDays: number, cycleTime: FlowPercentiles): AgingLevel => {
  if (cycleTime.p85 !== null && ageDays > cycleTime.p85) return 'atrasado'
  if (cycleTime.p50 !== null && ageDays > cycleTime.p50) return 'atencao'
  return 'ok'
}

export const toFlowItem = (timeline: Timeline): FlowItem => ({
  key: timeline.issue.key,
  summary: timeline.issue.summary,
  url: timeline.issue.url,
  project: timeline.issue.project,
  component: timeline.issue.component,
  status: timeline.issue.status,
  category: timeline.category,
})

const blockedSince = (timeline: Timeline) =>
  timeline.segments.findLast((segment) => segment.category === 'blocked')?.from ??
  timeline.createdAt

const uniqueSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => value !== null))].toSorted((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )

/**
 * Flow metrics of the window that ends now and starts on the Monday `weeks - 1` weeks before
 * the current one. Cycle time runs from the first move out of `todo` to the last move into
 * `done`; lead time from creation to done. Epics are containers and stay out.
 */
export const computeFlowMetrics = (input: FlowMetricsInput): FlowMetricsResponse => {
  const now = input.now.getTime()
  const from = weekStart(now) - (input.weeks - 1) * WEEK_MS
  const work = input.dataset.issues.filter((issue) => !isEpic(issue))
  const inProject = work.filter((issue) => !input.project || issue.project === input.project)
  const selected = inProject.filter(
    (issue) => !input.component || issue.component === input.component,
  )
  const projectOf = new Map(selected.map((issue) => [issue.key, issue.project]))
  const changes = input.dataset.changes.filter((change) => projectOf.has(change.issueKey))
  const timelines = buildTimelines({ issues: selected, changes }, input.workflow)

  const delivered = timelines.filter(
    (timeline) => timeline.doneAt !== null && timeline.doneAt >= from && timeline.doneAt <= now,
  )
  const cycleDays = delivered.flatMap((timeline) =>
    timeline.startedAt === null || timeline.doneAt === null
      ? []
      : [toDays(timeline.doneAt - timeline.startedAt)],
  )
  const cycleTime = percentiles(cycleDays)
  const leadDays = delivered.map((timeline) =>
    toDays((timeline.doneAt ?? now) - timeline.createdAt),
  )

  const wip = timelines.filter((timeline) => WORK_IN_PROGRESS.has(timeline.category))
  const aging: AgingItem[] = wip
    .map((timeline) => {
      const startedAt = timeline.startedAt ?? timeline.createdAt
      const ageDays = toDays(now - startedAt)
      return {
        ...toFlowItem(timeline),
        startedAt: new Date(startedAt).toISOString(),
        ageDays,
        level: agingLevel(ageDays, cycleTime),
      }
    })
    .toSorted((a, b) => b.ageDays - a.ageDays || a.key.localeCompare(b.key))

  const active: BlockedItem[] = wip
    .filter((timeline) => timeline.category === 'blocked')
    .map((timeline) => {
      const since = blockedSince(timeline)
      return {
        ...toFlowItem(timeline),
        blockedSince: new Date(since).toISOString(),
        blockedDays: toDays(now - since),
        totalBlockedDays: toDays(timeIn(timeline, 'blocked', timeline.createdAt, now)),
      }
    })
    .toSorted((a, b) => b.blockedDays - a.blockedDays || a.key.localeCompare(b.key))
  const blockedInWindow = timelines.map((timeline) => timeIn(timeline, 'blocked', from, now))

  return {
    generatedAt: input.now.toISOString(),
    filter: {
      project: input.project ?? null,
      component: input.component ?? null,
      weeks: input.weeks,
      from: new Date(from).toISOString(),
    },
    options: {
      projects: uniqueSorted(work.map((issue) => issue.project)),
      components: uniqueSorted(inProject.map((issue) => issue.component)),
    },
    throughput: Array.from({ length: input.weeks }, (_, index) => {
      const start = from + index * WEEK_MS
      return {
        weekStart: new Date(start).toISOString(),
        delivered: delivered.filter(
          (timeline) => (timeline.doneAt ?? 0) >= start && (timeline.doneAt ?? 0) < start + WEEK_MS,
        ).length,
      }
    }),
    cycleTime: { ...cycleTime, distribution: distribution(cycleDays) },
    leadTime: percentiles(leadDays),
    wip: {
      total: wip.length,
      inProgress: wip.filter((timeline) => timeline.category === 'in_progress').length,
      review: wip.filter((timeline) => timeline.category === 'review').length,
      blocked: active.length,
    },
    aging,
    blocked: {
      active,
      blockedDaysInWindow: toDays(blockedInWindow.reduce((total, ms) => total + ms, 0)),
      itemsBlockedInWindow: blockedInWindow.filter((ms) => ms > 0).length,
    },
    unmappedStatuses: unmappedStatuses(input.workflow, [
      ...selected,
      ...changes.map((change) => ({
        project: projectOf.get(change.issueKey) ?? '',
        status: change.toStatus,
      })),
    ]),
  }
}
