import type { DoraBand } from '@lab/contracts'

const DAY_HOURS = 24
const WEEK_HOURS = 7 * DAY_HOURS
const MONTH_HOURS = 30 * DAY_HOURS

/**
 * Cluster limits of the 2023 Accelerate State of DevOps report (DORA). Each metric lists the
 * best band first; a value takes the first band whose limit it meets.
 */
export const DORA_THRESHOLDS = {
  deploysPerDay: { elite: 1, high: 1 / 7, medium: 1 / 30 },
  leadTimeHours: { elite: DAY_HOURS, high: WEEK_HOURS, medium: MONTH_HOURS },
  changeFailureRate: { elite: 0.05, high: 0.1, medium: 0.15 },
  restoreHours: { elite: 1, high: DAY_HOURS, medium: WEEK_HOURS },
} as const

/** On demand (once a day or more) is elite; less than once a month is low. */
export const deploymentFrequencyBand = (deploysPerDay: number): DoraBand => {
  const limits = DORA_THRESHOLDS.deploysPerDay
  if (deploysPerDay >= limits.elite) return 'elite'
  if (deploysPerDay >= limits.high) return 'high'
  if (deploysPerDay >= limits.medium) return 'medium'
  return 'low'
}

const upperBound =
  (limits: { elite: number; high: number; medium: number }, inclusive: boolean) =>
  (value: number): DoraBand => {
    const within = (limit: number) => (inclusive ? value <= limit : value < limit)
    if (within(limits.elite)) return 'elite'
    if (within(limits.high)) return 'high'
    if (within(limits.medium)) return 'medium'
    return 'low'
  }

/** Less than a day is elite; a month or more is low. */
export const leadTimeBand = upperBound(DORA_THRESHOLDS.leadTimeHours, false)

/** Up to 5% is elite; above 15% is low. */
export const changeFailureBand = upperBound(DORA_THRESHOLDS.changeFailureRate, true)

/** Less than an hour is elite; a week or more is low. */
export const restoreBand = upperBound(DORA_THRESHOLDS.restoreHours, false)
