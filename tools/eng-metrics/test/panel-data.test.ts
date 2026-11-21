import { describe, expect, it } from 'vitest'
import { demoDataset } from '../src/demo.js'
import { buildPanelData, buildTrend } from '../src/panel-data.js'
import type { PullRequest } from '../src/types.js'

const NOW = '2026-11-20T15:00:00.000Z'

const merged = (number: number, mergedAt: string, reviewHours: number | null): PullRequest => ({
  number,
  title: `feat: LAB-${number}`,
  url: `https://example.invalid/pr/${number}`,
  author: 'ana',
  state: 'MERGED',
  isDraft: false,
  createdAt: '2026-11-01T12:00:00.000Z',
  readyAt: '2026-11-01T12:00:00.000Z',
  mergedAt,
  additions: 80,
  deletions: 20,
  headRef: `feat/LAB-${number}`,
  baseRef: 'develop',
  labels: ['risk:db-migration', 'plataforma'],
  requestedReviewers: [],
  reviews:
    reviewHours === null
      ? []
      : [
          {
            author: 'bruno',
            state: 'APPROVED',
            submittedAt: new Date(
              Date.parse('2026-11-01T12:00:00.000Z') + reviewHours * 3_600_000,
            ).toISOString(),
            comments: 1,
          },
        ],
  checks: 'SUCCESS',
  botSignal: 'pronto',
  taskKey: `LAB-${number}`,
})

describe('série semanal', () => {
  it('agrupa os merges por semana de segunda a domingo, da mais antiga à atual', () => {
    const trend = buildTrend(
      [
        merged(1, '2026-11-16T00:00:00.000Z', 4),
        merged(2, '2026-11-20T10:00:00.000Z', null),
        merged(3, '2026-11-15T23:00:00.000Z', 10),
        merged(4, '2026-08-01T00:00:00.000Z', 1),
        { ...merged(5, '2026-11-18T00:00:00.000Z', 2), state: 'OPEN', mergedAt: null },
      ],
      NOW,
      3,
    )
    expect(trend.map((w) => w.weekStart)).toEqual([
      '2026-11-02T00:00:00.000Z',
      '2026-11-09T00:00:00.000Z',
      '2026-11-16T00:00:00.000Z',
    ])
    expect(trend[2]).toEqual({
      weekStart: '2026-11-16T00:00:00.000Z',
      merged: 2,
      medianHoursToFirstReview: 4,
      medianSize: 100,
    })
    expect(trend[1]).toMatchObject({ merged: 1, medianHoursToFirstReview: 10 })
    expect(trend[0]).toMatchObject({ merged: 0, medianHoursToFirstReview: null, medianSize: null })
  })
})

describe('dados do painel', () => {
  it('publica fila, alertas, métricas e série já calculados para cada conjunto', () => {
    const data = buildPanelData([{ id: 'demo', title: 'Exemplo', dataset: demoDataset(NOW) }], NOW)
    expect(data).toMatchObject({ schemaVersion: 1, generatedAt: NOW })
    const [demo] = data.datasets
    expect(demo).toMatchObject({ id: 'demo', title: 'Exemplo', generatedAt: NOW })
    expect(demo?.queue.map((row) => row.position)).toEqual(demo?.queue.map((_, index) => index + 1))
    expect(demo?.queue[0]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining('https://'),
        risks: expect.any(Array),
        lines: expect.any(Number),
      }),
    )
    expect(demo?.alerts.every((alert) => alert.subject.length > 0)).toBe(true)
    expect(demo?.trend).toHaveLength(8)
    expect(demo?.metrics.merged).toBeGreaterThan(0)
  })

  it('mantém só rótulos de risco e o status da task na linha da fila', () => {
    const base = merged(7, '2026-11-19T00:00:00.000Z', 2)
    const open: PullRequest = {
      ...base,
      reviews: [
        ...base.reviews,
        { author: 'bruno', state: 'COMMENTED', submittedAt: NOW, comments: 0 },
        { author: 'github-actions', state: 'COMMENTED', submittedAt: NOW, comments: 0 },
      ],
      state: 'OPEN',
      mergedAt: null,
    }
    const data = buildPanelData(
      [
        {
          id: 'lab',
          title: 'Lab',
          dataset: {
            label: 'Lab',
            generatedAt: NOW,
            pullRequests: [open, { ...open, number: 8, taskKey: null }],
            tasks: [
              {
                key: 'LAB-7',
                title: 't',
                status: 'Code Review',
                acceptanceCriteria: 1,
                statusHistory: [],
              },
            ],
          },
        },
      ],
      NOW,
    )
    const queue = data.datasets[0]?.queue ?? []
    expect(queue[0]).toMatchObject({
      risks: ['risk:db-migration'],
      taskStatus: 'Code Review',
      reviewedBy: ['bruno'],
    })
    expect(queue[1]).toMatchObject({ taskStatus: null, taskKey: null })
  })

  it('gera o mesmo exemplo a cada execução', () => {
    expect(demoDataset(NOW)).toEqual(demoDataset(NOW))
    expect(demoDataset(NOW).pullRequests.length).toBeGreaterThan(40)
  })
})
