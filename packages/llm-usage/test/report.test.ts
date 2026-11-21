import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import { NO_TEAM, buildAiQualityReport, precisionAlerts, precisionSeries } from '../src/index.js'

const NOW = new Date('2026-11-21T18:00:00.000Z')

const run = (overrides: Partial<EvalRun> = {}): EvalRun => ({
  id: 'bot-2026-11-20-abc1234',
  suite: 'bot',
  runAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  model: 'gemini-2.5-pro',
  promptVersion: '1.1.0',
  offline: false,
  total: 10,
  passed: 9,
  inputTokens: null,
  outputTokens: null,
  latencyMs: null,
  cases: [],
  ...overrides,
})

let sequence = 0
const usage = (overrides: Partial<AiUsageRecord> = {}): AiUsageRecord => {
  sequence += 1
  return {
    id: `rec-${String(sequence).padStart(6, '0')}`,
    occurredAt: '2026-11-20T12:00:00.000Z',
    origin: 'chat',
    model: 'gemini-2.5-flash',
    inputTokens: 100,
    outputTokens: 10,
    costUsd: 0.5,
    pricingVersion: 'v1',
    team: null,
    skill: null,
    repository: null,
    pullRequest: null,
    runId: null,
    ...overrides,
  }
}

const report = (runs: EvalRun[], records: AiUsageRecord[], days = 30) =>
  buildAiQualityReport({
    runs,
    usage: records,
    thresholds: { bot: 0.8, chat: 0.85 },
    pricingVersion: 'v1',
    gateway: null,
    now: NOW,
    days,
  })

describe('precision over time', () => {
  it('orders the real-model runs of one suite and leaves offline runs out', () => {
    const series = precisionSeries(
      [
        run({ id: 'bot-b-0000002', runAt: '2026-11-20T10:00:00.000Z', passed: 7 }),
        run({ id: 'bot-a-0000001', runAt: '2026-11-13T10:00:00.000Z' }),
        run({ id: 'bot-offline-01', runAt: '2026-11-21T10:00:00.000Z', offline: true }),
        run({ id: 'bot-empty-0001', runAt: '2026-11-21T11:00:00.000Z', total: 0, passed: 0 }),
        run({ id: 'chat-x-0000001', suite: 'chat' }),
      ],
      'bot',
      0.8,
    )
    expect(series.points.map((point) => point.runId)).toEqual(['bot-a-0000001', 'bot-b-0000002'])
    expect(series.latest).toMatchObject({ runId: 'bot-b-0000002', rate: 0.7 })
  })

  it('alerts only when the latest run is below the threshold of its suite', () => {
    const below = precisionSeries([run({ passed: 7 })], 'bot', 0.8)
    const exact = precisionSeries([run({ passed: 8 })], 'bot', 0.8)
    const recovered = precisionSeries(
      [
        run({ id: 'bot-old-000001', runAt: '2026-11-01T10:00:00.000Z', passed: 5 }),
        run({ id: 'bot-new-000001', passed: 9 }),
      ],
      'bot',
      0.8,
    )
    expect(precisionAlerts([below])).toEqual([
      {
        suite: 'bot',
        rate: 0.7,
        threshold: 0.8,
        runId: 'bot-2026-11-20-abc1234',
        runAt: '2026-11-20T10:00:00.000Z',
      },
    ])
    expect(precisionAlerts([exact, recovered])).toEqual([])
    expect(precisionAlerts([precisionSeries([], 'chat', 0.8)])).toEqual([])
  })
})

describe('AI quality report', () => {
  it('uses the threshold of each suite and keeps only the window', () => {
    const built = report(
      [
        run({ id: 'chat-now-00001', suite: 'chat', passed: 8 }),
        run({ id: 'bot-ancient-001', runAt: '2026-09-01T10:00:00.000Z', passed: 1 }),
      ],
      [usage({ occurredAt: '2026-09-01T10:00:00.000Z' }), usage()],
    )
    expect(built.precision.map((series) => [series.suite, series.threshold])).toEqual([
      ['bot', 0.8],
      ['chat', 0.85],
    ])
    expect(built.precision[0]?.points).toEqual([])
    expect(built.alerts.map((alert) => alert.suite)).toEqual(['chat'])
    expect(built.cost.total).toMatchObject({ calls: 1, costUsd: 0.5 })
  })

  it('splits the cost by origin, team and pull request and counts unpriced calls', () => {
    const records = [
      usage({ origin: 'bot', team: 'Campanhas', repository: 'lab-demo/api', pullRequest: 7 }),
      usage({ origin: 'bot', team: 'Campanhas', repository: 'lab-demo/api', pullRequest: 7 }),
      usage({ origin: 'bot', team: 'Mensageria', repository: 'lab-demo/worker', pullRequest: 3 }),
      usage({ origin: 'chat', costUsd: null, pricingVersion: null }),
      usage({ origin: 'golden-set', costUsd: 0.25, runId: 'bot-2026-11-20-abc1234' }),
    ]
    const { cost } = report([], records)
    expect(cost.total).toMatchObject({ calls: 5, costUsd: 1.75, unpricedCalls: 1 })
    expect(cost.byOrigin.map((bucket) => [bucket.key, bucket.calls, bucket.costUsd])).toEqual([
      ['bot', 3, 1.5],
      ['chat', 1, 0],
      ['golden-set', 1, 0.25],
    ])
    expect(cost.byTeam.map((bucket) => bucket.key)).toEqual(['Campanhas', 'Mensageria', NO_TEAM])
    expect(cost.byPullRequest).toEqual([
      expect.objectContaining({ repository: 'lab-demo/api', pullRequest: 7, calls: 2, costUsd: 1 }),
      expect.objectContaining({ repository: 'lab-demo/worker', pullRequest: 3, calls: 1 }),
    ])
  })

  it('fills every day of the window, oldest first, with the cost of each origin', () => {
    const { cost } = report(
      [],
      [usage({ origin: 'bot', occurredAt: '2026-11-21T09:00:00.000Z', costUsd: 0.1 })],
      7,
    )
    expect(cost.byDay).toHaveLength(7)
    expect(cost.byDay[0]?.day).toBe('2026-11-15')
    expect(cost.byDay.at(-1)).toEqual({
      day: '2026-11-21',
      byOrigin: { bot: 0.1, chat: 0, 'golden-set': 0 },
    })
  })

  it('ignores records stamped after the report time', () => {
    const { cost } = report([], [usage({ occurredAt: '2026-11-21T19:00:00.000Z' })])
    expect(cost.total.calls).toBe(0)
  })
})
