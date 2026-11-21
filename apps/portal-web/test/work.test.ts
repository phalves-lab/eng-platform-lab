import type { MyWorkResponse, WorkItem } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  ALERT_LABEL,
  ALERT_TONE,
  daySummary,
  describeLoad,
  homeHref,
  jiraNotice,
  parseHomeSearch,
  reviewNotice,
  staleHint,
} from '../src/lib/work'

const item = (key: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
  key,
  summary: null,
  url: null,
  project: 'LAB',
  component: null,
  status: 'Em andamento',
  category: 'in_progress',
  since: '2026-11-19T12:00:00.000Z',
  idleBusinessDays: 1,
  stale: false,
  ...overrides,
})

const work = (overrides: Partial<MyWorkResponse> = {}): MyWorkResponse => ({
  generatedAt: '2026-11-20T12:00:00.000Z',
  login: 'carla.mendes',
  person: null,
  staleAfterBusinessDays: 3,
  jira: {
    state: 'ready',
    inProgress: [item('LAB-1'), item('LAB-2')],
    review: [item('LAB-3', { category: 'review' })],
    blocked: [item('LAB-4', { category: 'blocked', stale: true })],
    stale: [item('LAB-4', { category: 'blocked', stale: true })],
    blockedByMe: [
      {
        ...item('LAB-9'),
        assignee: 'Bruno',
        blocker: { ...item('LAB-1') },
      },
    ],
  },
  review: {
    state: 'ready',
    dataset: 'lab',
    github: 'carla',
    toReview: [
      {
        position: 1,
        number: 1,
        title: 'feat: x',
        url: 'https://example.invalid/pr/1',
        author: 'Bruno',
        ageBusinessDays: 1,
        level: 'ok',
        lines: 10,
      },
    ],
    mine: [],
    changesRequested: [],
  },
  alerts: [],
  ...overrides,
})

describe('day summary', () => {
  it('counts open tasks, stale ones and what depends on me', () => {
    expect(daySummary(work())).toEqual({
      open: 4,
      inReview: 1,
      stale: 1,
      dependsOnMe: 2,
      alerts: 0,
    })
  })

  it('leaves the Jira counts empty when Jira is not linked and keeps the reviews', () => {
    const summary = daySummary(work({ jira: { state: 'unavailable', reason: 'no_database' } }))
    expect(summary).toMatchObject({ open: null, inReview: null, stale: null, dependsOnMe: 1 })
    expect(
      daySummary(
        work({
          jira: { state: 'unavailable', reason: 'not_collected' },
          review: { state: 'unavailable', reason: 'not_collected' },
        }),
      ).dependsOnMe,
    ).toBe(0)
  })
})

describe('notices', () => {
  it('explains how to turn on Jira for each reason', () => {
    expect(jiraNotice('no_database', 'x').description).toContain('DATABASE_URL')
    expect(jiraNotice('not_collected', 'x').description).toContain('collect:jira')
    expect(jiraNotice('unknown_person', 'dev.local').description).toContain(
      'Inclua dev.local em catalog/people/',
    )
    expect(jiraNotice('no_jira_account', 'x').title).toBe('Sua conta do Jira não está no catálogo')
    expect(
      reviewNotice({ state: 'unavailable', reason: 'no_github_account' }).description,
    ).toContain('campo github')
    expect(reviewNotice({ state: 'unavailable', reason: 'not_collected' }).title).toBe(
      'A fila de review ainda não foi coletada',
    )
  })

  it('describes the stale threshold and the alerts', () => {
    expect(staleHint(1)).toBe('Sem mudança de status há mais de 1 dia útil')
    expect(staleHint(3)).toBe('Sem mudança de status há mais de 3 dias úteis')
    expect(ALERT_TONE.alta).toBe('danger')
    expect(ALERT_LABEL.blocking_others).toBe('Segura alguém')
  })
})

describe('team load', () => {
  it('describes the load in words without any score', () => {
    expect(
      describeLoad({
        login: 'a',
        name: 'A',
        role: 'dev',
        jira: { inProgress: 2, review: 1, blocked: 1, stale: 0 },
        pendingReviews: 1,
      }),
    ).toEqual(['2 em andamento', '1 em review', '1 bloqueada', '0 paradas', '1 review pendente'])
    expect(
      describeLoad({ login: 'b', name: 'B', role: 'lead', jira: null, pendingReviews: 3 }),
    ).toEqual(['3 reviews pendentes'])
    expect(
      describeLoad({ login: 'c', name: 'C', role: 'dev', jira: null, pendingReviews: null }),
    ).toEqual([])
  })
})

describe('home search', () => {
  it('reads dataset and team and drops malformed teams', () => {
    expect(parseHomeSearch({ conjunto: 'demo', time: 'dados' })).toEqual({
      dataset: 'demo',
      team: 'dados',
    })
    expect(parseHomeSearch({ conjunto: ['lab', 'demo'], time: 'Not A Team' })).toEqual({
      dataset: 'lab',
      team: undefined,
    })
    expect(parseHomeSearch({ conjunto: ' ' })).toEqual({ dataset: undefined, team: undefined })
  })

  it('builds the home URL with only what is set', () => {
    expect(homeHref({})).toBe('/')
    expect(homeHref({ dataset: 'lab', team: 'dados' })).toBe('/?conjunto=lab&time=dados')
    expect(homeHref({ team: 'dados' })).toBe('/?time=dados')
  })
})
