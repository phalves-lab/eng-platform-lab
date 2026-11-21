import type {
  AiOrigin,
  CostBucket,
  CostDay,
  EvalSuite,
  PrecisionAlert,
  PrecisionSeries,
} from '@lab/contracts'

export const AI_WINDOWS = [30, 90, 180] as const
export type AiWindow = (typeof AI_WINDOWS)[number]

export const SUITE_LABEL: Record<EvalSuite, string> = {
  bot: 'Bot de review',
  chat: 'Chat do portal',
}

export const ORIGIN_LABEL: Record<AiOrigin, string> = {
  bot: 'Bot de review',
  chat: 'Chat do portal',
  'golden-set': 'Golden set',
}

export const isAiWindow = (value: string | undefined): value is `${AiWindow}` =>
  AI_WINDOWS.some((days) => String(days) === value)

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Dollars with cents; amounts under one cent show four decimals instead of reading as zero. */
export const formatUsd = (value: number) => {
  if (value > 0 && value < 0.01) return `US$ ${value.toFixed(4).replace('.', ',')}`
  return usd
    .format(value)
    .replace('$', 'US$ ')
    .replace(/[.,]/g, (mark) => (mark === '.' ? ',' : '.'))
}

export const formatRate = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? 'sem run' : `${Math.round(rate * 100)}%`

export const formatTokens = (value: number) => value.toLocaleString('pt-BR')

export const formatCalls = (calls: number) => (calls === 1 ? '1 chamada' : `${calls} chamadas`)

const shortDate = (iso: string) => {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}`
}

export interface PrecisionDatum {
  date: string
  bot: number | null
  chat: number | null
}

/** One row per day with a run, so both golden sets share the time axis of the chart. */
export const precisionChartData = (series: PrecisionSeries[]): PrecisionDatum[] => {
  const rows = new Map<string, PrecisionDatum>()
  for (const { suite, points } of series) {
    for (const point of points) {
      const day = point.runAt.slice(0, 10)
      const row = rows.get(day) ?? { date: day, bot: null, chat: null }
      row[suite] = Math.round(point.rate * 1000) / 10
      rows.set(day, row)
    }
  }
  return [...rows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, date: shortDate(row.date) }))
}

export interface CostDatum {
  week: string
  bot: number
  chat: number
  'golden-set': number
}

/** Daily cost folded into weeks that start on the first day of the window. */
export const costChartData = (days: CostDay[]): CostDatum[] => {
  const weeks: CostDatum[] = []
  days.forEach((day, index) => {
    if (index % 7 === 0) weeks.push({ week: shortDate(day.day), bot: 0, chat: 0, 'golden-set': 0 })
    const week = weeks.at(-1)
    if (!week) return
    for (const origin of ['bot', 'chat', 'golden-set'] as const) {
      week[origin] = Math.round((week[origin] + day.byOrigin[origin]) * 1e6) / 1e6
    }
  })
  return weeks
}

export const alertMessage = (alert: PrecisionAlert) =>
  `O último run do ${SUITE_LABEL[alert.suite].toLowerCase()} acertou ${formatRate(alert.rate)}, abaixo do limiar de ${formatRate(alert.threshold)}.`

export const unpricedHint = (bucket: CostBucket) =>
  bucket.unpricedCalls
    ? `${formatCalls(bucket.unpricedCalls)} sem preço na tabela`
    : 'Todas as chamadas com preço'

export const budgetShare = (spend: number, budget: number | null) =>
  budget ? Math.min(100, Math.round((spend / budget) * 100)) : null
