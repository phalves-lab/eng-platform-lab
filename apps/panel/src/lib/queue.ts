import type { BotSignal, QueueLevel, QueueRow } from '@lab/eng-metrics/contract'

export const ALL = 'todos'

export type SignalFilter = Exclude<BotSignal, null> | 'sem_comentario'

export interface QueueFilters {
  search: string
  level: QueueLevel | typeof ALL
  author: string
  signal: SignalFilter | typeof ALL
}

export type QueueSort = 'fila' | 'tempo' | 'tamanho'

export const EMPTY_FILTERS: QueueFilters = { search: '', level: ALL, author: ALL, signal: ALL }

const matchesSearch = (row: QueueRow, search: string) => {
  const term = search.trim().toLowerCase()
  if (!term) return true
  return [row.title, row.author, row.taskKey ?? '', `#${row.number}`, ...row.requestedReviewers]
    .join(' ')
    .toLowerCase()
    .includes(term)
}

export const filterQueue = (rows: QueueRow[], filters: QueueFilters) =>
  rows.filter(
    (row) =>
      matchesSearch(row, filters.search) &&
      (filters.level === ALL || row.level === filters.level) &&
      (filters.author === ALL || row.author === filters.author) &&
      (filters.signal === ALL || (row.botSignal ?? 'sem_comentario') === filters.signal),
  )

const SORTERS: Record<QueueSort, (a: QueueRow, b: QueueRow) => number> = {
  fila: (a, b) => a.position - b.position,
  tempo: (a, b) => b.ageBusinessDays - a.ageBusinessDays,
  tamanho: (a, b) => b.lines - a.lines,
}

export const sortQueue = (rows: QueueRow[], sort: QueueSort) => [...rows].sort(SORTERS[sort])

export const queueAuthors = (rows: QueueRow[]) => [...new Set(rows.map((row) => row.author))].sort()

export const hasActiveFilters = (filters: QueueFilters) =>
  filters.search.trim() !== '' ||
  filters.level !== ALL ||
  filters.author !== ALL ||
  filters.signal !== ALL

export const summarizeQueue = (rows: QueueRow[]) => ({
  total: rows.length,
  late: rows.filter((row) => row.level === 'atrasado').length,
  attention: rows.filter((row) => row.level === 'atencao').length,
  withoutReview: rows.filter((row) => !row.hasHumanReview).length,
})
