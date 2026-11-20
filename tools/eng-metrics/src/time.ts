const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const isWeekday = (date: Date) => {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

/**
 * Dias úteis corridos entre duas datas, com fração: conta só o tempo que cai de segunda a
 * sexta (em UTC). Feriados não entram; a régua é para comparar filas, não para SLA contratual.
 */
export const businessDaysBetween = (from: string, to: string): number => {
  let cursor = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (end <= cursor) return 0
  let total = 0
  while (cursor < end) {
    const dayEnd = Math.min(end, Math.floor(cursor / DAY_MS) * DAY_MS + DAY_MS)
    if (isWeekday(new Date(cursor))) total += dayEnd - cursor
    cursor = dayEnd
  }
  return total / DAY_MS
}

export const hoursBetween = (from: string, to: string): number =>
  Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / HOUR_MS)

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export const daysAgo = (now: string, days: number): string =>
  new Date(new Date(now).getTime() - days * DAY_MS).toISOString()
