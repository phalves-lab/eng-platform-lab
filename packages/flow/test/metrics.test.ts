import { describe, expect, it } from 'vitest'
import {
  agingLevel,
  buildTimelines,
  categoryAt,
  computeFlowMetrics,
  distribution,
  type FlowIssue,
  type FlowStatusChange,
  parseWorkflow,
  percentile,
  percentiles,
  timeIn,
} from '../src/index.js'

const workflow = parseWorkflow(`
categories:
  - { id: todo, label: A fazer, statuses: [A fazer] }
  - { id: in_progress, label: Em andamento, statuses: [Em andamento] }
  - { id: review, label: Em review, statuses: [Code Review] }
  - { id: blocked, label: Bloqueado, statuses: [Bloqueado] }
  - { id: done, label: Concluído, statuses: [Concluído] }
`)

const NOW = new Date('2026-11-20T12:00:00.000Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000).toISOString()

const issue = (key: string, overrides: Partial<FlowIssue> = {}): FlowIssue => ({
  key,
  project: key.split('-')[0] ?? 'LAB',
  component: 'Portal',
  issueType: 'Story',
  status: 'A fazer',
  summary: `Item ${key}`,
  url: `https://jira.example.test/browse/${key}`,
  epicKey: null,
  createdAt: day(-30),
  resolvedAt: null,
  ...overrides,
})

const path = (key: string, steps: [string, number][], initial = 'A fazer'): FlowStatusChange[] => {
  let from = initial
  return steps.map(([to, offset]) => {
    const change = { issueKey: key, fromStatus: from, toStatus: to, changedAt: day(offset) }
    from = to
    return change
  })
}

const done = (key: string, start: number, end: number, overrides: Partial<FlowIssue> = {}) => ({
  issue: issue(key, { status: 'Concluído', resolvedAt: day(end), ...overrides }),
  changes: path(key, [
    ['Em andamento', start],
    ['Concluído', end],
  ]),
})

const entries = [
  done('LAB-1', -10, -8),
  done('LAB-2', -9, -5),
  done('LAB-3', -7, -1),
  done('LAB-4', -20, -10, { component: 'Coletores' }),
  done('OPS-1', -6, -3, { component: 'Filas' }),
  done('LAB-5', -100, -90),
  {
    issue: issue('LAB-6', { status: 'Em andamento' }),
    changes: path('LAB-6', [['Em andamento', -12]]),
  },
  {
    issue: issue('LAB-7', { status: 'Code Review' }),
    changes: path('LAB-7', [
      ['Em andamento', -3],
      ['Code Review', -1],
    ]),
  },
  {
    issue: issue('LAB-8', { status: 'Bloqueado' }),
    changes: path('LAB-8', [
      ['Em andamento', -9],
      ['Bloqueado', -8],
      ['Em andamento', -6],
      ['Bloqueado', -2],
    ]),
  },
  {
    issue: issue('LAB-9', { status: 'Em andamento', resolvedAt: null }),
    changes: path('LAB-9', [
      ['Em andamento', -6],
      ['Concluído', -4],
      ['Em andamento', -2],
    ]),
  },
  { issue: issue('LAB-10', { status: 'Triagem' }), changes: [] },
  { issue: issue('LAB-11', { issueType: 'Epic', status: 'Em andamento' }), changes: [] },
]

const dataset = {
  issues: entries.map((entry) => entry.issue),
  changes: entries.flatMap((entry) => entry.changes),
}

const metrics = (overrides: { project?: string; component?: string; weeks?: number } = {}) =>
  computeFlowMetrics({ dataset, workflow, now: NOW, weeks: 4, ...overrides })

describe('percentiles', () => {
  it('uses the nearest rank', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(sorted, 50)).toBe(5)
    expect(percentile(sorted, 85)).toBe(9)
    expect(percentile(sorted, 95)).toBe(10)
    expect(percentile([7], 50)).toBe(7)
    expect(percentile([], 50)).toBeNull()
    expect(percentiles([3, 1, 2])).toEqual({ count: 3, p50: 2, p85: 3, p95: 3 })
  })

  it('buckets cycle times on fixed edges with an open last bucket', () => {
    const buckets = distribution([0.5, 1, 4.9, 30])
    expect(buckets.map((b) => [b.minDays, b.maxDays, b.count])).toEqual([
      [0, 1, 1],
      [1, 2, 1],
      [2, 3, 0],
      [3, 5, 1],
      [5, 8, 0],
      [8, 13, 0],
      [13, 21, 0],
      [21, null, 1],
    ])
  })

  it('flags aging above the cycle time p50 and p85', () => {
    const cycle = { count: 3, p50: 2, p85: 4, p95: 6 }
    expect(agingLevel(1, cycle)).toBe('ok')
    expect(agingLevel(3, cycle)).toBe('atencao')
    expect(agingLevel(5, cycle)).toBe('atrasado')
    expect(agingLevel(50, { count: 0, p50: null, p85: null, p95: null })).toBe('ok')
  })
})

describe('timelines', () => {
  it('replays transitions into categories and measures time in each', () => {
    const [timeline] = buildTimelines(
      {
        issues: [issue('LAB-8', { status: 'Bloqueado' })],
        changes: entries[8]?.changes ?? [],
      },
      workflow,
    )
    expect(timeline?.segments.map((segment) => segment.category)).toEqual([
      'todo',
      'in_progress',
      'blocked',
      'in_progress',
      'blocked',
    ])
    expect(timeline?.startedAt).toBe(Date.parse(day(-9)))
    expect(timeline?.doneAt).toBeNull()
    if (!timeline) return
    expect(categoryAt(timeline, Date.parse(day(-40)))).toBeNull()
    expect(categoryAt(timeline, Date.parse(day(-7)))).toBe('blocked')
    expect(categoryAt(timeline, Date.parse(day(0)))).toBe('blocked')
    expect(timeIn(timeline, 'blocked', Date.parse(day(-30)), NOW.getTime()) / 86_400_000).toBe(4)
  })

  it('takes the done date from the resolution when no transition says so', () => {
    const [timeline] = buildTimelines(
      { issues: [issue('LAB-20', { status: 'Concluído', resolvedAt: day(-2) })], changes: [] },
      workflow,
    )
    expect(timeline?.doneAt).toBe(Date.parse(day(-2)))
    expect(timeline?.startedAt).toBe(Date.parse(day(-2)))
  })
})

describe('flow metrics', () => {
  it('counts deliveries per week inside the window only', () => {
    const result = metrics()
    expect(result.filter).toEqual({
      project: null,
      component: null,
      weeks: 4,
      from: '2026-10-26T00:00:00.000Z',
    })
    expect(result.throughput.map((week) => [week.weekStart.slice(0, 10), week.delivered])).toEqual([
      ['2026-10-26', 0],
      ['2026-11-02', 0],
      ['2026-11-09', 3],
      ['2026-11-16', 2],
    ])
  })

  it('computes cycle and lead time percentiles over delivered items', () => {
    const result = metrics()
    expect(result.cycleTime).toMatchObject({ count: 5, p50: 4, p85: 10, p95: 10 })
    expect(result.leadTime).toMatchObject({ count: 5, p50: 25, p85: 29, p95: 29 })
    expect(result.cycleTime.distribution.reduce((total, b) => total + b.count, 0)).toBe(5)
  })

  it('reports WIP by category, aging with levels and active blocks', () => {
    const result = metrics()
    expect(result.wip).toEqual({ total: 4, inProgress: 2, review: 1, blocked: 1 })
    expect(result.aging.map((item) => [item.key, item.ageDays, item.level])).toEqual([
      ['LAB-6', 12, 'atrasado'],
      ['LAB-8', 9, 'atencao'],
      ['LAB-9', 6, 'atencao'],
      ['LAB-7', 3, 'ok'],
    ])
    expect(result.blocked.active).toEqual([
      expect.objectContaining({
        key: 'LAB-8',
        blockedSince: day(-2),
        blockedDays: 2,
        totalBlockedDays: 4,
        url: 'https://jira.example.test/browse/LAB-8',
      }),
    ])
    expect(result.blocked).toMatchObject({ blockedDaysInWindow: 4, itemsBlockedInWindow: 1 })
  })

  it('keeps a reopened item out of deliveries and epics out of everything', () => {
    const result = metrics()
    expect(result.aging.some((item) => item.key === 'LAB-9')).toBe(true)
    expect(result.aging.some((item) => item.key === 'LAB-11')).toBe(false)
    expect(result.cycleTime.count).toBe(5)
  })

  it('treats unknown statuses as todo and reports them', () => {
    const result = metrics()
    expect(result.unmappedStatuses).toEqual([{ project: 'LAB', status: 'Triagem' }])
    expect(result.aging.some((item) => item.key === 'LAB-10')).toBe(false)
  })

  it('narrows by project and component and lists the options of the project', () => {
    const lab = metrics({ project: 'LAB' })
    expect(lab.options).toEqual({ projects: ['LAB', 'OPS'], components: ['Coletores', 'Portal'] })
    expect(lab.cycleTime.count).toBe(4)
    const collectors = metrics({ project: 'LAB', component: 'Coletores' })
    expect(collectors.cycleTime).toMatchObject({ count: 1, p50: 10 })
    expect(collectors.wip.total).toBe(0)
    const ops = metrics({ project: 'OPS' })
    expect(ops.options.components).toEqual(['Filas'])
    expect(ops.throughput.at(-1)?.delivered).toBe(1)
  })

  it('widens the window with more weeks', () => {
    expect(metrics({ weeks: 26 }).cycleTime.count).toBe(6)
  })
})
