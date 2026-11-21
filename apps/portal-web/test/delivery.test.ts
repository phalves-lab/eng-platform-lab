import { describe, expect, it } from 'vitest'
import {
  formatCount,
  formatHours,
  formatLines,
  formatMedianBusinessDays,
  formatShare,
  formatTrendValue,
  formatWeek,
  hasTrend,
  NO_DATA,
  pairsByAuthor,
  resolveDataset,
  reviewersByName,
  signalDistribution,
  trendSeries,
} from '../src/lib/delivery'

const week = (weekStart: string, merged: number, hours: number | null) => ({
  weekStart,
  merged,
  medianHoursToFirstReview: hours,
  medianSize: null,
})

describe('delivery formatters', () => {
  it('shows missing medians as no data, never as zero', () => {
    expect(formatHours(null)).toBe(NO_DATA)
    expect(formatMedianBusinessDays(null)).toBe(NO_DATA)
    expect(formatLines(null)).toBe(NO_DATA)
    expect(formatHours(0)).toBe('0,0 h')
    expect(formatTrendValue('hours', null)).toBe(NO_DATA)
    expect(formatTrendValue('merged', undefined)).toBe(NO_DATA)
  })

  it('formats hours, business days, lines, counts and shares in pt-BR', () => {
    expect(formatHours(15.28)).toBe('15,3 h')
    expect(formatMedianBusinessDays(2.13)).toBe('2,1 dias úteis')
    expect(formatMedianBusinessDays(0.6)).toBe('0,6 dia útil')
    expect(formatLines(1)).toBe('1 linha')
    expect(formatLines(1250.5)).toBe('1.251 linhas')
    expect(formatCount(0, 'PR', 'PRs')).toBe('0 PRs')
    expect(formatTrendValue('merged', 1)).toBe('1 PR')
    expect(formatTrendValue('hours', 12.5)).toBe('12,5 h')
    expect(formatShare(0.435)).toBe('44%')
  })

  it('formats week starts in UTC so the day does not shift', () => {
    expect(formatWeek('2026-11-16T00:00:00.000Z')).toBe('16/11')
  })
})

describe('delivery data shaping', () => {
  it('resolves the requested dataset or falls back to the first known one', () => {
    const available = [{ id: 'demo' }, { id: 'lab' }]
    expect(resolveDataset('lab', available)).toBe('lab')
    expect(resolveDataset('prod', available)).toBe('demo')
    expect(resolveDataset(undefined, [{ id: 'outro' }, { id: 'lab' }])).toBe('lab')
    expect(resolveDataset('lab', [])).toBeNull()
  })

  it('builds the weekly series keeping empty weeks as gaps', () => {
    const trend = [
      week('2026-11-09T00:00:00.000Z', 0, null),
      week('2026-11-16T00:00:00.000Z', 4, 12.345),
    ]
    expect(trendSeries(trend)).toEqual([
      { week: '09/11', merged: 0, hours: null },
      { week: '16/11', merged: 4, hours: 12.3 },
    ])
    expect(hasTrend(trend)).toBe(true)
    expect(hasTrend([week('2026-11-09T00:00:00.000Z', 0, null)])).toBe(false)
  })

  it('distributes bot signals in a fixed order with shares', () => {
    const { total, slices } = signalDistribution({
      pronto: 2,
      gate: 1,
      ajustes: 1,
      sem_comentario: 0,
    })
    expect(total).toBe(4)
    expect(slices.map((slice) => [slice.label, slice.share])).toEqual([
      ['Pronto', 0.5],
      ['Pendências', 0.25],
      ['Ajustes', 0.25],
      ['Sem comentário', 0],
    ])
    expect(
      signalDistribution({ pronto: 0, gate: 0, ajustes: 0, sem_comentario: 0 }).slices[0]?.share,
    ).toBe(0)
  })

  it('lists review load and pairs by name, not by volume', () => {
    const load = (reviewer: string, reviews: number) => ({
      reviewer,
      reviews,
      pullRequests: reviews,
      comments: 0,
    })
    expect(
      reviewersByName([load('elisa', 12), load('Ana', 1), load('bruno', 8)]).map((r) => r.reviewer),
    ).toEqual(['Ana', 'bruno', 'elisa'])
    expect(
      pairsByAuthor([
        { author: 'fabio', reviewer: 'gabi', count: 3 },
        { author: 'ana', reviewer: 'diego', count: 3 },
        { author: 'fabio', reviewer: 'elisa', count: 4 },
      ]),
    ).toEqual([
      { author: 'ana', total: 3, reviewers: [{ reviewer: 'diego', count: 3 }] },
      {
        author: 'fabio',
        total: 7,
        reviewers: [
          { reviewer: 'elisa', count: 4 },
          { reviewer: 'gabi', count: 3 },
        ],
      },
    ])
  })
})
