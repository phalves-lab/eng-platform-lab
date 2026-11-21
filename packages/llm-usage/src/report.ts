import type {
  AiOrigin,
  AiQualityResponse,
  AiUsageRecord,
  CostBucket,
  CostDay,
  EvalRun,
  EvalSuite,
  GatewaySpend,
  PrecisionAlert,
  PrecisionPoint,
  PrecisionSeries,
  PullRequestCost,
} from '@lab/contracts'
import { roundUsd } from './pricing.js'

const ORIGINS: AiOrigin[] = ['bot', 'chat', 'golden-set']
const SUITES: EvalSuite[] = ['bot', 'chat']
const DAY_MS = 86_400_000
const MAX_PULL_REQUESTS = 20
export const NO_TEAM = 'sem time'

export interface AiQualityInput {
  runs: EvalRun[]
  usage: AiUsageRecord[]
  thresholds: Record<EvalSuite, number>
  pricingVersion: string
  gateway: GatewaySpend | null
  now: Date
  days: number
}

const emptyBucket = (key: string): CostBucket => ({
  key,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  unpricedCalls: 0,
})

const add = (bucket: CostBucket, record: AiUsageRecord): CostBucket => ({
  key: bucket.key,
  calls: bucket.calls + 1,
  inputTokens: bucket.inputTokens + record.inputTokens,
  outputTokens: bucket.outputTokens + record.outputTokens,
  costUsd: roundUsd(bucket.costUsd + (record.costUsd ?? 0)),
  unpricedCalls: bucket.unpricedCalls + (record.costUsd === null ? 1 : 0),
})

const groupBy = (records: AiUsageRecord[], keyOf: (record: AiUsageRecord) => string) => {
  const buckets = new Map<string, CostBucket>()
  for (const record of records) {
    const key = keyOf(record)
    buckets.set(key, add(buckets.get(key) ?? emptyBucket(key), record))
  }
  return buckets
}

const byCost = (a: CostBucket, b: CostBucket) =>
  b.costUsd - a.costUsd || b.calls - a.calls || a.key.localeCompare(b.key)

const toPoint = (run: EvalRun): PrecisionPoint => ({
  runId: run.id,
  runAt: run.runAt,
  rate: run.total ? run.passed / run.total : 0,
  passed: run.passed,
  total: run.total,
  model: run.model,
  promptVersion: run.promptVersion,
  commit: run.commit,
})

/**
 * Precision over time of one golden set. Offline runs replay scripted answers and say nothing
 * about the model, so only runs against a real model count.
 */
export const precisionSeries = (
  runs: EvalRun[],
  suite: EvalSuite,
  threshold: number,
): PrecisionSeries => {
  const points = runs
    .filter((run) => run.suite === suite && !run.offline && run.total > 0)
    .sort((a, b) => a.runAt.localeCompare(b.runAt) || a.id.localeCompare(b.id))
    .map(toPoint)
  return { suite, threshold, points, latest: points.at(-1) ?? null }
}

/** Alerts when the latest run of a golden set is below its configured threshold. */
export const precisionAlerts = (series: PrecisionSeries[]): PrecisionAlert[] =>
  series.flatMap(({ suite, threshold, latest }) =>
    latest && latest.rate < threshold
      ? [{ suite, rate: latest.rate, threshold, runId: latest.runId, runAt: latest.runAt }]
      : [],
  )

const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)

const costByDay = (records: AiUsageRecord[], since: Date, now: Date): CostDay[] => {
  const days = new Map<string, Record<AiOrigin, number>>()
  for (let time = since.getTime(); time <= now.getTime(); time += DAY_MS) {
    days.set(dayOf(new Date(time).toISOString()), { bot: 0, chat: 0, 'golden-set': 0 })
  }
  for (const record of records) {
    const day = days.get(dayOf(record.occurredAt))
    if (day) day[record.origin] = roundUsd(day[record.origin] + (record.costUsd ?? 0))
  }
  return [...days.entries()].map(([day, byOrigin]) => ({ day, byOrigin }))
}

const costByPullRequest = (records: AiUsageRecord[]): PullRequestCost[] => {
  const withPull = records.filter((record) => record.repository && record.pullRequest)
  return [...groupBy(withPull, (record) => `${record.repository}#${record.pullRequest}`).values()]
    .sort(byCost)
    .slice(0, MAX_PULL_REQUESTS)
    .map((bucket) => {
      const [repository = '', pull = '0'] = bucket.key.split('#')
      return { ...bucket, repository, pullRequest: Number(pull) }
    })
}

/** Precision of the bot and chat golden sets and the estimated AI cost of the window. */
export const buildAiQualityReport = (input: AiQualityInput): AiQualityResponse => {
  const since = new Date(input.now.getTime() - (input.days - 1) * DAY_MS)
  const from = dayOf(since.toISOString())
  const inWindow = (iso: string) => dayOf(iso) >= from && new Date(iso) <= input.now
  const runs = input.runs.filter((run) => inWindow(run.runAt))
  const usage = input.usage.filter((record) => inWindow(record.occurredAt))
  const precision = SUITES.map((suite) => precisionSeries(runs, suite, input.thresholds[suite]))
  const origins = groupBy(usage, (record) => record.origin)
  return {
    generatedAt: input.now.toISOString(),
    days: input.days,
    pricingVersion: input.pricingVersion,
    precision,
    alerts: precisionAlerts(precision),
    cost: {
      total: usage.reduce(add, emptyBucket('total')),
      byOrigin: ORIGINS.map((origin) => origins.get(origin) ?? emptyBucket(origin)),
      byTeam: [...groupBy(usage, (record) => record.team ?? NO_TEAM).values()].sort(byCost),
      byPullRequest: costByPullRequest(usage),
      byDay: costByDay(usage, since, input.now),
    },
    gateway: input.gateway,
  }
}
