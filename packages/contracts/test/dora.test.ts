import { describe, expect, it } from 'vitest'
import { DoraMetricsResponseSchema, DoraQuerySchema } from '../src/index.js'

describe('DORA contracts', () => {
  it('defaults to 12 weeks and accepts one team or one repository', () => {
    expect(DoraQuerySchema.parse({})).toEqual({ weeks: 12 })
    expect(DoraQuerySchema.parse({ team: ' Campanhas ', weeks: '8' })).toEqual({
      team: 'Campanhas',
      weeks: 8,
    })
    expect(DoraQuerySchema.parse({ repo: 'lab-demo/campanhas-api' }).repo).toBe(
      'lab-demo/campanhas-api',
    )
  })

  it('rejects both filters together, unknown repositories and windows out of range', () => {
    expect(
      DoraQuerySchema.safeParse({ team: 'Campanhas', repo: 'lab-demo/campanhas-api' }).success,
    ).toBe(false)
    expect(DoraQuerySchema.safeParse({ repo: 'sem-dono' }).success).toBe(false)
    expect(DoraQuerySchema.safeParse({ weeks: 3 }).success).toBe(false)
    expect(DoraQuerySchema.safeParse({ weeks: 27 }).success).toBe(false)
  })

  it('keeps rates between 0 and 1 in the response', () => {
    const metric = { deploys: 1, perWeek: 1, band: 'high' }
    const summary = {
      deploymentFrequency: metric,
      leadTime: { medianHours: 2, changes: 1, pending: 0, band: 'elite' },
      changeFailureRate: { failed: 2, deploys: 1, rate: 2, band: 'low' },
      timeToRestore: { medianHours: null, restored: 0, open: 0, band: null },
    }
    const response = {
      generatedAt: '2026-11-21T12:00:00.000Z',
      window: { from: '2026-08-31T00:00:00.000Z', to: '2026-11-21T12:00:00.000Z', weeks: 12 },
      filter: { team: null, repo: null },
      summary,
      trend: [],
      repos: [],
      teams: [],
      deploys: [],
      incidents: [],
    }
    expect(DoraMetricsResponseSchema.safeParse(response).success).toBe(false)
    const valid = {
      ...summary,
      changeFailureRate: { failed: 0, deploys: 1, rate: 0, band: 'elite' },
    }
    expect(DoraMetricsResponseSchema.safeParse({ ...response, summary: valid }).success).toBe(true)
  })
})
