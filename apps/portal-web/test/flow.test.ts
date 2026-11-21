import { describe, expect, it } from 'vitest'
import {
  bucketLabel,
  bucketTick,
  CATEGORY_LABEL,
  cycleSeries,
  DEFAULT_WEEKS,
  describeStatus,
  firstItems,
  flowHref,
  formatAverage,
  formatDays,
  formatPercentiles,
  parseFlowSearch,
  throughputSeries,
  totalDelivered,
  weeklyAverage,
} from '../src/lib/flow'
import { NO_DATA } from '../src/lib/delivery'

describe('flow formatters', () => {
  it('formats days with one decimal and singular below two', () => {
    expect(formatDays(null)).toBe(NO_DATA)
    expect(formatDays(1)).toBe('1,0 dia')
    expect(formatDays(3.25)).toBe('3,3 dias')
    expect(formatPercentiles(null, null)).toBe('Sem entregas na janela')
    expect(formatPercentiles(5, 8.5)).toBe('p85 5,0 dias · p95 8,5 dias')
    expect(formatAverage(2.5)).toBe('2,5 por semana em média')
  })

  it('names the histogram buckets as people read them', () => {
    expect(bucketLabel({ minDays: 0, maxDays: 1 })).toBe('até 1 dia')
    expect(bucketLabel({ minDays: 3, maxDays: 5 })).toBe('3 a 5 dias')
    expect(bucketLabel({ minDays: 21, maxDays: null })).toBe('21 dias ou mais')
    expect(cycleSeries([{ minDays: 0, maxDays: 2, count: 4 }])).toEqual([
      { tick: '<2', range: 'até 2 dias', count: 4 },
    ])
    expect(bucketTick({ minDays: 3, maxDays: 5 })).toBe('3-5')
    expect(bucketTick({ minDays: 21, maxDays: null })).toBe('21+')
  })

  it('cuts long lists and says how many were left out', () => {
    expect(firstItems([1, 2, 3], 2)).toEqual({ shown: [1, 2], hidden: 1 })
    expect(firstItems([1], 5)).toEqual({ shown: [1], hidden: 0 })
  })

  it('labels every workflow category and does not repeat the status', () => {
    expect(Object.keys(CATEGORY_LABEL)).toEqual([
      'todo',
      'in_progress',
      'review',
      'blocked',
      'done',
    ])
    expect(describeStatus('blocked', 'Bloqueado', null)).toBe('Bloqueado')
    expect(describeStatus('review', 'Validação', 'Filas')).toBe('Em review · Validação · Filas')
  })

  it('sums and averages weekly deliveries', () => {
    const throughput = [
      { weekStart: '2026-11-09T00:00:00.000Z', delivered: 3 },
      { weekStart: '2026-11-16T00:00:00.000Z', delivered: 2 },
    ]
    expect(throughputSeries(throughput)).toEqual([
      { week: '09/11', delivered: 3 },
      { week: '16/11', delivered: 2 },
    ])
    expect(totalDelivered(throughput)).toBe(5)
    expect(weeklyAverage(throughput)).toBe(2.5)
    expect(weeklyAverage([])).toBe(0)
  })
})

describe('flow filters in the URL', () => {
  it('keeps valid filters and drops the rest', () => {
    expect(parseFlowSearch({})).toEqual({ weeks: DEFAULT_WEEKS })
    expect(parseFlowSearch({ projeto: 'lab', componente: ' Portal ', semanas: '4' })).toEqual({
      project: 'LAB',
      component: 'Portal',
      weeks: 4,
    })
    expect(parseFlowSearch({ projeto: 'x-1', componente: 'Portal', semanas: '7' })).toEqual({
      weeks: DEFAULT_WEEKS,
    })
    expect(parseFlowSearch({ componente: 'Portal' })).toEqual({ weeks: DEFAULT_WEEKS })
    expect(parseFlowSearch({ projeto: ['OPS', 'LAB'] })).toMatchObject({ project: 'OPS' })
  })

  it('builds links without default values', () => {
    expect(flowHref('/entregas/fluxo', { weeks: DEFAULT_WEEKS })).toBe('/entregas/fluxo')
    expect(flowHref('/entregas/fluxo', { project: 'LAB', component: 'Coletores', weeks: 4 })).toBe(
      '/entregas/fluxo?projeto=LAB&componente=Coletores&semanas=4',
    )
    expect(flowHref('/entregas/fluxo', { component: 'Coletores', weeks: 10 })).toBe(
      '/entregas/fluxo',
    )
  })
})
