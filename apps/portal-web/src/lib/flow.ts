import type { CycleTimeBucket, FlowCategory, FlowMetricsResponse } from '@lab/contracts'
import { formatWeek, NO_DATA } from '@/lib/delivery'

export const WEEK_OPTIONS = [4, 8, 10, 12, 26] as const
export const DEFAULT_WEEKS = 10
const PROJECT_KEY = /^[A-Z][A-Z0-9]+$/

export const CATEGORY_LABEL: Record<FlowCategory, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  review: 'Em review',
  blocked: 'Bloqueado',
  done: 'Concluído',
}

const oneDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export const formatDays = (days: number | null) => {
  if (days === null) return NO_DATA
  return `${oneDecimal.format(days)} ${days >= 2 ? 'dias' : 'dia'}`
}

const dayCount = (days: number) => `${integer.format(days)} ${days === 1 ? 'dia' : 'dias'}`

/** Histogram bucket as read on the axis: `até 1 dia`, `3 a 5 dias`, `21 dias ou mais`. */
export const bucketLabel = ({ minDays, maxDays }: Pick<CycleTimeBucket, 'minDays' | 'maxDays'>) => {
  if (maxDays === null) return `${dayCount(minDays)} ou mais`
  if (minDays === 0) return `até ${dayCount(maxDays)}`
  return `${integer.format(minDays)} a ${dayCount(maxDays)}`
}

export interface FlowFilter {
  project?: string
  component?: string
  weeks: number
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** Reads `projeto`, `componente` and `semanas` from the page URL, dropping anything invalid. */
export const parseFlowSearch = (search: {
  projeto?: string | string[]
  componente?: string | string[]
  semanas?: string | string[]
}): FlowFilter => {
  const requested = first(search.projeto)?.trim().toUpperCase()
  const project = requested && PROJECT_KEY.test(requested) ? requested : undefined
  const component = first(search.componente)?.trim()
  const weeks = Number(first(search.semanas))
  return {
    ...(project ? { project } : {}),
    ...(project && component ? { component: component.slice(0, 80) } : {}),
    weeks: WEEK_OPTIONS.some((option) => option === weeks) ? weeks : DEFAULT_WEEKS,
  }
}

/** Page URL for a filter; the default window stays out of the address. */
export const flowHref = (basePath: string, filter: FlowFilter) => {
  const search = new URLSearchParams()
  if (filter.project) search.set('projeto', filter.project)
  if (filter.project && filter.component) search.set('componente', filter.component)
  if (filter.weeks !== DEFAULT_WEEKS) search.set('semanas', String(filter.weeks))
  const text = search.toString()
  return text ? `${basePath}?${text}` : basePath
}

export interface ThroughputDatum {
  week: string
  delivered: number
}

export const throughputSeries = (throughput: FlowMetricsResponse['throughput']) =>
  throughput.map((point) => ({ week: formatWeek(point.weekStart), delivered: point.delivered }))

export const totalDelivered = (throughput: FlowMetricsResponse['throughput']) =>
  throughput.reduce((total, point) => total + point.delivered, 0)

export const weeklyAverage = (throughput: FlowMetricsResponse['throughput']) =>
  throughput.length ? Math.round((totalDelivered(throughput) / throughput.length) * 10) / 10 : 0

export interface CycleDatum {
  tick: string
  range: string
  count: number
}

/** Short axis tick for a bucket, such as `<1`, `3-5` or `21+`; the tooltip shows the full label. */
export const bucketTick = ({ minDays, maxDays }: Pick<CycleTimeBucket, 'minDays' | 'maxDays'>) => {
  if (maxDays === null) return `${integer.format(minDays)}+`
  if (minDays === 0) return `<${integer.format(maxDays)}`
  return `${integer.format(minDays)}-${integer.format(maxDays)}`
}

export const cycleSeries = (distribution: CycleTimeBucket[]): CycleDatum[] =>
  distribution.map((bucket) => ({
    tick: bucketTick(bucket),
    range: bucketLabel(bucket),
    count: bucket.count,
  }))

/** First `limit` items and how many were left out, for long lists inside a card. */
export const firstItems = <T>(items: T[], limit: number) => ({
  shown: items.slice(0, limit),
  hidden: Math.max(items.length - limit, 0),
})

export const formatPercentiles = (p85: number | null, p95: number | null) =>
  p85 === null ? 'Sem entregas na janela' : `p85 ${formatDays(p85)} · p95 ${formatDays(p95)}`

export const formatAverage = (average: number) =>
  `${oneDecimal.format(average)} por semana em média`

/** Category and raw status of an item, without repeating them when the names match. */
export const describeStatus = (
  category: FlowCategory,
  status: string,
  component: string | null,
) => {
  const label = CATEGORY_LABEL[category]
  const parts =
    label.localeCompare(status, 'pt-BR', { sensitivity: 'base' }) === 0 ? [label] : [label, status]
  return [...parts, ...(component ? [component] : [])].join(' · ')
}
