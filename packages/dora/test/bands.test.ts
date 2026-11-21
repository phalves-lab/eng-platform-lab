import { describe, expect, it } from 'vitest'
import {
  changeFailureBand,
  deploymentFrequencyBand,
  leadTimeBand,
  median,
  restoreBand,
  weekStart,
} from '../src/index.js'

describe('DORA bands', () => {
  it('ranks deployment frequency from on demand to less than once a month', () => {
    expect(deploymentFrequencyBand(3)).toBe('elite')
    expect(deploymentFrequencyBand(1)).toBe('elite')
    expect(deploymentFrequencyBand(0.99)).toBe('high')
    expect(deploymentFrequencyBand(1 / 7)).toBe('high')
    expect(deploymentFrequencyBand(1 / 8)).toBe('medium')
    expect(deploymentFrequencyBand(1 / 30)).toBe('medium')
    expect(deploymentFrequencyBand(1 / 31)).toBe('low')
  })

  it('ranks lead time by day, week and month', () => {
    expect(leadTimeBand(23.9)).toBe('elite')
    expect(leadTimeBand(24)).toBe('high')
    expect(leadTimeBand(167.9)).toBe('high')
    expect(leadTimeBand(168)).toBe('medium')
    expect(leadTimeBand(719)).toBe('medium')
    expect(leadTimeBand(720)).toBe('low')
  })

  it('ranks change failure rate by 5, 10 and 15 percent', () => {
    expect(changeFailureBand(0)).toBe('elite')
    expect(changeFailureBand(0.05)).toBe('elite')
    expect(changeFailureBand(0.051)).toBe('high')
    expect(changeFailureBand(0.1)).toBe('high')
    expect(changeFailureBand(0.15)).toBe('medium')
    expect(changeFailureBand(0.151)).toBe('low')
  })

  it('ranks time to restore by hour, day and week', () => {
    expect(restoreBand(0.5)).toBe('elite')
    expect(restoreBand(1)).toBe('high')
    expect(restoreBand(23.9)).toBe('high')
    expect(restoreBand(24)).toBe('medium')
    expect(restoreBand(168)).toBe('low')
  })
})

describe('time helpers', () => {
  it('starts weeks on Monday at midnight UTC', () => {
    const iso = (value: string) => new Date(weekStart(Date.parse(value))).toISOString()
    expect(iso('2026-11-21T12:00:00Z')).toBe('2026-11-16T00:00:00.000Z')
    expect(iso('2026-11-16T00:00:00Z')).toBe('2026-11-16T00:00:00.000Z')
    expect(iso('2026-11-22T23:59:00Z')).toBe('2026-11-16T00:00:00.000Z')
    expect(iso('2026-11-23T00:00:00Z')).toBe('2026-11-23T00:00:00.000Z')
  })

  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([1 / 3])).toBe(0.33)
  })
})
