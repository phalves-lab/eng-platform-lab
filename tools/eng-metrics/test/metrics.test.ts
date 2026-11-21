import { describe, expect, it } from 'vitest'
import { buildAlerts, buildMetrics, buildQueue } from '../src/metrics.js'
import { businessDaysBetween, daysAgo, hoursBetween, median } from '../src/time.js'
import type { PullRequest, TaskStatus } from '../src/types.js'

const NOW = '2026-11-20T15:00:00.000Z'

const pr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  title: 'feat: LAB-1 algo',
  url: 'https://example.invalid/pr/1',
  author: 'ana',
  state: 'OPEN',
  isDraft: false,
  createdAt: '2026-11-18T12:00:00.000Z',
  readyAt: '2026-11-18T12:00:00.000Z',
  mergedAt: null,
  additions: 50,
  deletions: 10,
  headRef: 'feat/LAB-1-algo',
  baseRef: 'develop',
  labels: [],
  requestedReviewers: ['bruno'],
  reviews: [],
  checks: 'SUCCESS',
  botSignal: 'pronto',
  taskKey: 'LAB-1',
  ...overrides,
})

const task = (overrides: Partial<TaskStatus> = {}): TaskStatus => ({
  key: 'LAB-1',
  title: 't',
  status: 'Code Review',
  acceptanceCriteria: 2,
  statusHistory: [],
  ...overrides,
})

describe('tempo', () => {
  it('conta só dias úteis, com fração', () => {
    expect(businessDaysBetween('2026-11-20T12:00:00Z', '2026-11-23T12:00:00Z')).toBe(1)
    expect(businessDaysBetween('2026-11-18T00:00:00Z', '2026-11-18T12:00:00Z')).toBe(0.5)
    expect(businessDaysBetween('2026-11-20T00:00:00Z', '2026-11-19T00:00:00Z')).toBe(0)
  })

  it('calcula horas, mediana e datas relativas', () => {
    expect(hoursBetween('2026-11-20T10:00:00Z', '2026-11-20T13:30:00Z')).toBe(3.5)
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(daysAgo(NOW, 1)).toBe('2026-11-19T15:00:00.000Z')
  })
})

describe('fila de review', () => {
  it('ordena pela entrada em code review no board e cai para o PR sem histórico', () => {
    const queue = buildQueue(
      [
        pr({ number: 1, taskKey: 'LAB-1', readyAt: '2026-11-10T12:00:00Z' }),
        pr({ number: 2, taskKey: 'LAB-2', readyAt: '2026-11-17T12:00:00Z' }),
        pr({ number: 3, isDraft: true }),
        pr({ number: 4, state: 'MERGED' }),
      ],
      [
        task({
          key: 'LAB-1',
          statusHistory: [{ status: 'Code Review', at: '2026-11-20T09:00:00Z' }],
        }),
      ],
      NOW,
    )
    expect(queue.map((q) => q.pr.number)).toEqual([2, 1])
    expect(queue[0]).toMatchObject({ enteredFrom: 'pr', level: 'atrasado' })
    expect(queue[1]).toMatchObject({ enteredFrom: 'jira', level: 'ok' })
  })

  it('marca atenção entre 1 e 3 dias úteis e reconhece review humana', () => {
    const [item] = buildQueue(
      [
        pr({
          readyAt: '2026-11-18T15:00:00Z',
          reviews: [{ author: 'bruno', state: 'COMMENTED', submittedAt: NOW, comments: 1 }],
        }),
      ],
      [],
      NOW,
    )
    expect(item).toMatchObject({ level: 'atencao', hasHumanReview: true })
  })
})

describe('alertas', () => {
  it('cobre PR parado, check vermelho, sem task, grande e bot pedindo ajustes', () => {
    const alerts = buildAlerts(
      [
        pr({
          number: 9,
          readyAt: '2026-11-10T12:00:00Z',
          checks: 'FAILURE',
          taskKey: null,
          headRef: 'minha-branch',
          additions: 500,
          botSignal: 'ajustes',
        }),
        pr({
          number: 10,
          author: 'dependabot[bot]',
          headRef: 'dependabot/npm/x',
          taskKey: null,
          additions: 900,
        }),
      ],
      [],
      NOW,
    )
    const kinds = alerts.map((a) => a.kind)
    expect(kinds[0]).toBe('Review parado')
    expect(kinds).toEqual(
      expect.arrayContaining(['Check vermelho', 'PR sem task', 'PR grande', 'Bot pediu ajustes']),
    )
    expect(
      alerts.filter(
        (a) => a.message.includes('#10') && ['PR sem task', 'PR grande'].includes(a.kind),
      ),
    ).toEqual([])
  })

  it('cobre tasks sem critério, sem PR e com PR mergeado parada', () => {
    const alerts = buildAlerts(
      [pr({ number: 5, taskKey: 'LAB-5', state: 'MERGED', mergedAt: '2026-11-19T12:00:00Z' })],
      [
        task({ key: 'LAB-3', status: 'Pronta', acceptanceCriteria: 0 }),
        task({
          key: 'LAB-4',
          status: 'Em andamento',
          statusHistory: [{ status: 'Em andamento', at: '2026-11-10T12:00:00Z' }],
        }),
        task({ key: 'LAB-5', status: 'Em andamento' }),
        task({ key: 'LAB-6', status: 'Concluída' }),
      ],
      NOW,
    )
    expect(alerts.map((a) => a.kind)).toEqual([
      'Task sem critério de aceite',
      'Task sem PR',
      'PR mergeado com task parada',
    ])
  })
})

describe('métricas', () => {
  it('calcula tempos, tamanho, checks, sinais e carga de review', () => {
    const merged = (n: number, author: string, reviewer: string, hours: number) =>
      pr({
        number: n,
        author,
        state: 'MERGED',
        readyAt: '2026-11-16T12:00:00Z',
        mergedAt: '2026-11-18T12:00:00Z',
        reviews: [
          {
            author: reviewer,
            state: 'APPROVED',
            submittedAt: new Date(
              Date.parse('2026-11-16T12:00:00Z') + hours * 3_600_000,
            ).toISOString(),
            comments: 2,
          },
          {
            author: 'github-actions',
            state: 'COMMENTED',
            submittedAt: '2026-11-16T13:00:00Z',
            comments: 0,
          },
        ],
      })
    const metrics = buildMetrics(
      [
        merged(1, 'ana', 'bruno', 2),
        merged(2, 'ana', 'bruno', 6),
        merged(3, 'carla', 'ana', 4),
        pr({ number: 4, botSignal: null }),
        pr({
          number: 5,
          state: 'MERGED',
          mergedAt: '2026-09-01T00:00:00Z',
          readyAt: '2026-09-01T00:00:00Z',
        }),
      ],
      NOW,
    )
    expect(metrics).toMatchObject({
      merged: 3,
      medianHoursToFirstReview: 4,
      medianBusinessDaysToMerge: 2,
      medianSize: 60,
      mergedWithFailingChecks: 0,
      signals: { pronto: 3, sem_comentario: 1 },
    })
    expect(metrics.reviewers[0]).toEqual({
      reviewer: 'bruno',
      reviews: 2,
      pullRequests: 2,
      comments: 4,
    })
    expect(metrics.pairs[0]).toEqual({ author: 'ana', reviewer: 'bruno', count: 2 })
  })
})
