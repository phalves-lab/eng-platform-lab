import { describe, expect, it } from 'vitest'
import {
  AskRequestSchema,
  AskResponseSchema,
  ReviewMetricsQuerySchema,
  ReviewMetricsResponseSchema,
  ReviewMetricsSchema,
  StandardFilterSchema,
  StandardSchema,
  UserSchema,
} from '../src/index.js'

describe('contracts', () => {
  it('accepts valid payloads and rejects invalid ones', () => {
    expect(
      StandardSchema.parse({
        id: 'ENG-GIT-01',
        area: 'ENG-GIT',
        title: 'Base',
        status: 'VIGENTE',
        fields: { Regra: 'x' },
        text: 'x',
        source: 'a.md',
      }).id,
    ).toBe('ENG-GIT-01')
    expect(StandardSchema.safeParse({ id: 'x' }).success).toBe(false)
    expect(AskRequestSchema.parse({ question: '  qual o padrão?  ' }).question).toBe(
      'qual o padrão?',
    )
    expect(AskRequestSchema.safeParse({ question: 'a' }).success).toBe(false)
    expect(AskResponseSchema.safeParse({ mode: 'llm', answer: '', sources: [] }).success).toBe(
      false,
    )
    expect(UserSchema.safeParse({ login: 'a', name: 'A', role: 'owner' }).success).toBe(false)
    expect(StandardFilterSchema.parse({ status: 'LACUNA' })).toEqual({ status: 'LACUNA' })
  })
})

describe('review metrics contracts', () => {
  const metrics = {
    windowDays: 30,
    merged: 3,
    medianHoursToFirstReview: null,
    medianBusinessDaysToMerge: 1.5,
    medianSize: 120,
    mergedWithFailingChecks: 0,
    signals: { pronto: 2, gate: 1, ajustes: 0, sem_comentario: 0 },
    reviewers: [{ reviewer: 'ana', reviews: 2, pullRequests: 2, comments: 3 }],
    pairs: [{ author: 'bruno', reviewer: 'ana', count: 2 }],
  }
  const response = {
    dataset: 'demo',
    title: 'Exemplo',
    generatedAt: '2026-11-20T12:00:00.000Z',
    metrics,
    trend: [
      {
        weekStart: '2026-11-16T00:00:00.000Z',
        merged: 0,
        medianHoursToFirstReview: null,
        medianSize: null,
      },
    ],
    alerts: [{ kind: 'Review parado', severity: 'alta', subject: '#1', message: 'x', url: null }],
  }

  it('keeps null medians and rejects partial signals or unknown datasets', () => {
    expect(ReviewMetricsResponseSchema.parse(response).metrics.medianHoursToFirstReview).toBeNull()
    expect(ReviewMetricsSchema.safeParse({ ...metrics, signals: { pronto: 1 } }).success).toBe(
      false,
    )
    expect(ReviewMetricsSchema.safeParse({ ...metrics, merged: -1 }).success).toBe(false)
    expect(ReviewMetricsResponseSchema.safeParse({ ...response, dataset: 'prod' }).success).toBe(
      false,
    )
  })

  it('defaults the dataset to lab and only accepts known ids', () => {
    expect(ReviewMetricsQuerySchema.parse({})).toEqual({ dataset: 'lab' })
    expect(ReviewMetricsQuerySchema.parse({ dataset: 'demo' })).toEqual({ dataset: 'demo' })
    expect(ReviewMetricsQuerySchema.safeParse({ dataset: 'prod' }).success).toBe(false)
  })
})
