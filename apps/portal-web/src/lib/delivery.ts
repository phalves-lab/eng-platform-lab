import {
  type BotSignalCounts,
  type DatasetId,
  DatasetIdSchema,
  type ReviewerLoad,
  type ReviewPair,
  type ReviewTrendPoint,
} from '@lab/contracts'
import { formatBusinessDays, SIGNAL_LABEL } from '@/lib/labels'

export const NO_DATA = 'sem dado'

const oneDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const dayMonth = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
})

export const formatHours = (hours: number | null) =>
  hours === null ? NO_DATA : `${oneDecimal.format(hours)} h`

export const formatMedianBusinessDays = (days: number | null) =>
  days === null ? NO_DATA : formatBusinessDays(days)

export const formatCount = (count: number, singular: string, plural: string) =>
  `${integer.format(count)} ${Math.round(count) === 1 ? singular : plural}`

export const formatLines = (lines: number | null) =>
  lines === null ? NO_DATA : formatCount(lines, 'linha', 'linhas')

export const formatShare = (share: number) => percent.format(share)

/** Week starts come from the collector at UTC midnight; formatting in UTC keeps the right day. */
export const formatWeek = (iso: string) => dayMonth.format(new Date(iso))

/** Picks the requested dataset when the data file has it, otherwise the first known one. */
export const resolveDataset = (
  requested: string | undefined,
  available: { id: string }[],
): DatasetId | null => {
  const known = available.flatMap(({ id }) => {
    const parsed = DatasetIdSchema.safeParse(id)
    return parsed.success ? [parsed.data] : []
  })
  return known.find((id) => id === requested) ?? known[0] ?? null
}

export interface TrendDatum {
  week: string
  merged: number
  hours: number | null
}

export const trendSeries = (trend: ReviewTrendPoint[]): TrendDatum[] =>
  trend.map((point) => ({
    week: formatWeek(point.weekStart),
    merged: point.merged,
    hours:
      point.medianHoursToFirstReview === null
        ? null
        : Math.round(point.medianHoursToFirstReview * 10) / 10,
  }))

export const hasTrend = (trend: ReviewTrendPoint[]) => trend.some((point) => point.merged > 0)

export const formatTrendValue = (series: keyof Omit<TrendDatum, 'week'>, value: unknown) => {
  const amount = typeof value === 'number' ? value : null
  if (series === 'hours') return formatHours(amount)
  return amount === null ? NO_DATA : formatCount(amount, 'PR', 'PRs')
}

export type SignalKey = keyof BotSignalCounts

export const SIGNAL_ORDER: SignalKey[] = ['pronto', 'gate', 'ajustes', 'sem_comentario']

export const SIGNAL_KEY_LABEL: Record<SignalKey, string> = {
  ...SIGNAL_LABEL,
  sem_comentario: 'Sem comentário',
}

export interface SignalSlice {
  key: SignalKey
  label: string
  count: number
  share: number
}

export const signalDistribution = (signals: BotSignalCounts) => {
  const total = SIGNAL_ORDER.reduce((sum, key) => sum + signals[key], 0)
  const slices: SignalSlice[] = SIGNAL_ORDER.map((key) => ({
    key,
    label: SIGNAL_KEY_LABEL[key],
    count: signals[key],
    share: total ? signals[key] / total : 0,
  }))
  return { total, slices }
}

const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })

/** Review load listed by name so the screen balances work without ranking people. */
export const reviewersByName = (reviewers: ReviewerLoad[]) =>
  reviewers.toSorted((a, b) => byName(a.reviewer, b.reviewer))

export interface AuthorPairs {
  author: string
  total: number
  reviewers: { reviewer: string; count: number }[]
}

export const pairsByAuthor = (pairs: ReviewPair[]): AuthorPairs[] => {
  const authors = new Map<string, AuthorPairs>()
  for (const { author, reviewer, count } of pairs) {
    const entry = authors.get(author) ?? { author, total: 0, reviewers: [] }
    entry.total += count
    entry.reviewers.push({ reviewer, count })
    authors.set(author, entry)
  }
  return [...authors.values()]
    .map((entry) => ({
      ...entry,
      reviewers: entry.reviewers.toSorted((a, b) => byName(a.reviewer, b.reviewer)),
    }))
    .toSorted((a, b) => byName(a.author, b.author))
}
