import { describe, expect, it } from 'vitest'
import {
  AskRequestSchema,
  AskResponseSchema,
  ReviewMetricsQuerySchema,
  ReviewMetricsResponseSchema,
  ReviewMetricsSchema,
  McpServerSchema,
  PluginFilterSchema,
  AskStreamEventSchema,
  StandardFilterSchema,
  StandardSchema,
  UserSchema,
  createSseParser,
  encodeSseEvent,
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

  it('accepts model answers with citations and the streamed events', () => {
    const answer = {
      mode: 'llm',
      answer: 'Use ENG-GIT-02.',
      citations: [{ kind: 'standard', ref: 'ENG-GIT-02', label: 'ENG-GIT-02', source: 'a.md' }],
    }
    expect(AskResponseSchema.parse(answer).mode).toBe('llm')
    expect(
      AskResponseSchema.safeParse({ ...answer, citations: [{ kind: 'pessoa', ref: 'x' }] }).success,
    ).toBe(false)
    expect(AskStreamEventSchema.parse({ type: 'done', response: answer }).type).toBe('done')
    expect(AskStreamEventSchema.safeParse({ type: 'start', mode: 'outro' }).success).toBe(false)
  })
})

describe('server-sent events', () => {
  it('encodes JSON events and reads them back across split chunks', () => {
    const read = createSseParser()
    const wire = encodeSseEvent({ type: 'delta', text: 'olá' }) + encodeSseEvent({ n: 2 })
    expect(read(wire.slice(0, 10))).toEqual([])
    expect(read(wire.slice(10))).toEqual(['{"type":"delta","text":"olá"}', '{"n":2}'])
    expect(read(': ping\r\n\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\n')).toEqual(['a\nb'])
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

describe('catalog contracts', () => {
  it('limits maturity and MCP scope to the known values', () => {
    expect(PluginFilterSchema.parse({ maturity: 'pilot' })).toEqual({ maturity: 'pilot' })
    expect(PluginFilterSchema.safeParse({ maturity: 'beta' }).success).toBe(false)
    expect(McpServerSchema.safeParse({ name: 'x', scope: 'admin' }).success).toBe(false)
  })
})
