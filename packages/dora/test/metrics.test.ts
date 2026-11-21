import type { Change, Deploy, Incident } from '@lab/database'
import { describe, expect, it } from 'vitest'
import { type DoraInput, type DoraRepo, DoraFilterError, computeDora } from '../src/index.js'

const NOW = '2026-11-21T12:00:00.000Z'
const API = 'lab-demo/campanhas-api'
const WEB = 'lab-demo/campanhas-web'
const WORKER = 'lab-demo/notificacoes-worker'

const repos: DoraRepo[] = [
  {
    repo: API,
    team: 'Campanhas',
    system: 'campanhas',
    productionEnvironment: 'production',
    defaultBranch: 'main',
    source: { type: 'fixture' },
  },
  {
    repo: WEB,
    team: 'Campanhas',
    system: 'campanhas',
    productionEnvironment: 'prod',
    defaultBranch: 'main',
    source: { type: 'fixture' },
  },
  {
    repo: WORKER,
    team: 'Mensageria',
    system: 'notificacoes',
    productionEnvironment: 'production',
    defaultBranch: 'main',
    source: { type: 'fixture' },
  },
]

const deploy = (overrides: Partial<Deploy> = {}): Deploy => ({
  repo: API,
  environment: 'production',
  sha: 'aaaaaaa0000000000000',
  deployedAt: '2026-11-18T12:00:00.000Z',
  status: 'success',
  url: null,
  commitShas: [],
  ...overrides,
})

const change = (overrides: Partial<Change> = {}): Change => ({
  repo: API,
  pullNumber: 1,
  title: 'feat: filtro',
  mergeSha: 'bbbbbbb0000000000000',
  firstCommitAt: '2026-11-17T12:00:00.000Z',
  mergedAt: '2026-11-18T08:00:00.000Z',
  ...overrides,
})

const incident = (overrides: Partial<Incident> = {}): Incident => ({
  id: 'INC-1',
  system: 'campanhas',
  severity: 'sev2',
  startedAt: '2026-11-18T13:00:00.000Z',
  endedAt: '2026-11-18T13:30:00.000Z',
  title: 'Erro na listagem',
  cause: null,
  ...overrides,
})

const run = (overrides: Partial<DoraInput> = {}) =>
  computeDora({ repos, deploys: [], changes: [], incidents: [], now: NOW, weeks: 12, ...overrides })

const repoSummary = (result: ReturnType<typeof run>, repo: string) =>
  result.repos.find((entry) => entry.repo === repo)?.summary

describe('computeDora window', () => {
  it('covers the current week and the previous ones, starting on Monday', () => {
    const result = run({ weeks: 4 })
    expect(result.window).toEqual({
      from: '2026-10-26T00:00:00.000Z',
      to: NOW,
      weeks: 4,
    })
    expect(result.trend.map((point) => point.weekStart)).toEqual([
      '2026-10-26T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z',
      '2026-11-09T00:00:00.000Z',
      '2026-11-16T00:00:00.000Z',
    ])
  })

  it('leaves every band empty when there is nothing to measure', () => {
    const { summary } = run()
    expect(summary).toEqual({
      deploymentFrequency: { deploys: 0, perWeek: 0, band: null },
      leadTime: { medianHours: null, changes: 0, pending: 0, band: null },
      changeFailureRate: { failed: 0, deploys: 0, rate: null, band: null },
      timeToRestore: { medianHours: null, restored: 0, open: 0, band: null },
    })
    expect(run().trend.every((point) => point.changeFailureRate === null)).toBe(true)
  })
})

describe('deployment frequency and change failure rate', () => {
  it('counts production deploys of catalog repositories inside the window only', () => {
    const result = run({
      deploys: [
        deploy(),
        deploy({ deployedAt: '2026-11-19T12:00:00.000Z' }),
        deploy({ environment: 'staging' }),
        deploy({ repo: WEB, environment: 'production' }),
        deploy({ repo: WEB, environment: 'prod' }),
        deploy({ repo: 'lab-demo/fora-do-catalogo' }),
        deploy({ deployedAt: '2026-08-01T12:00:00.000Z' }),
        deploy({ deployedAt: '2026-11-22T12:00:00.000Z' }),
      ],
    })
    expect(repoSummary(result, API)?.deploymentFrequency.deploys).toBe(2)
    expect(repoSummary(result, WEB)?.deploymentFrequency.deploys).toBe(1)
    expect(result.summary.deploymentFrequency.deploys).toBe(3)
    expect(result.deploys).toHaveLength(3)
  })

  it('keeps failed pipelines out of frequency and failure rate but lists them', () => {
    const result = run({
      deploys: [
        deploy({ status: 'failure', deployedAt: '2026-11-18T11:00:00.000Z' }),
        deploy({ deployedAt: '2026-11-18T12:00:00.000Z' }),
      ],
    })
    const summary = repoSummary(result, API)
    expect(summary?.deploymentFrequency.deploys).toBe(1)
    expect(summary?.changeFailureRate).toEqual({ failed: 0, deploys: 1, rate: 0, band: 'elite' })
    expect(result.deploys.map((item) => [item.status, item.failed])).toEqual([
      ['success', false],
      ['failure', false],
    ])
  })

  it('fails a deploy that was rolled back or that an incident names as the cause', () => {
    const result = run({
      deploys: [
        deploy({ sha: 'c1c1c1c1c1c1', deployedAt: '2026-11-16T12:00:00.000Z' }),
        deploy({ sha: 'c2c2c2c2c2c2', deployedAt: '2026-11-17T12:00:00.000Z' }),
        deploy({ sha: 'c3c3c3c3c3c3', status: 'rolled_back' }),
        deploy({ sha: 'c4c4c4c4c4c4', deployedAt: '2026-11-19T12:00:00.000Z' }),
      ],
      incidents: [incident({ cause: { repo: API, sha: 'c2c2c2c' } })],
    })
    const summary = repoSummary(result, API)
    expect(summary?.changeFailureRate).toEqual({ failed: 2, deploys: 4, rate: 0.5, band: 'low' })
    const failed = result.deploys.filter((item) => item.failed).map((item) => item.sha)
    expect(failed).toEqual(['c3c3c3c3c3c3', 'c2c2c2c2c2c2'])
    expect(result.deploys.find((item) => item.sha === 'c2c2c2c2c2c2')?.incidentIds).toEqual([
      'INC-1',
    ])
  })

  it('does not match an incident cause shorter than 7 characters or from another repository', () => {
    const result = run({
      deploys: [deploy({ sha: 'c2c2c2c2c2c2' })],
      incidents: [
        incident({ id: 'INC-1', cause: { repo: WEB, sha: 'c2c2c2c' } }),
        incident({ id: 'INC-2', cause: { repo: API, sha: 'c2c2c2' } }),
      ],
    })
    expect(repoSummary(result, API)?.changeFailureRate.failed).toBe(0)
  })

  it('rates frequency per day of the window', () => {
    const daily = Array.from({ length: 84 }, (_, day) =>
      deploy({
        sha: `d${String(day).padStart(6, '0')}`,
        deployedAt: new Date(Date.parse('2026-08-31T12:00:00.000Z') + day * 86_400_000)
          .toISOString()
          .replace('.000Z', 'Z'),
      }),
    )
    const summary = repoSummary(run({ deploys: daily }), API)
    expect(summary?.deploymentFrequency.band).toBe('elite')
    expect(summary?.deploymentFrequency.perWeek).toBeCloseTo(7, 0)
    const sparse = repoSummary(run({ deploys: daily.filter((_, day) => day % 50 === 0) }), API)
    expect(sparse?.deploymentFrequency.band).toBe('low')
  })
})

describe('lead time for changes', () => {
  it('runs from the first commit of the pull request to the first deploy that ships it', () => {
    const result = run({
      deploys: [
        deploy({ sha: 'f0f0f0f0f0f0', status: 'failure', deployedAt: '2026-11-18T10:00:00.000Z' }),
        deploy({
          sha: 'f1f1f1f1f1f1',
          deployedAt: '2026-11-18T12:00:00.000Z',
          commitShas: ['bbbbbbb0000000000000'],
        }),
        deploy({
          sha: 'f2f2f2f2f2f2',
          deployedAt: '2026-11-19T12:00:00.000Z',
          commitShas: ['bbbbbbb', 'eeeeeee0000000000000'],
        }),
      ],
      changes: [
        change(),
        change({
          pullNumber: 2,
          mergeSha: 'f2f2f2f2f2f2',
          firstCommitAt: '2026-11-15T12:00:00.000Z',
        }),
        change({ pullNumber: 3, mergeSha: '9999999999', mergedAt: '2026-11-20T08:00:00.000Z' }),
        change({ pullNumber: 4, mergeSha: '8888888888', mergedAt: '2026-07-20T08:00:00.000Z' }),
      ],
    })
    expect(repoSummary(result, API)?.leadTime).toEqual({
      medianHours: 60,
      changes: 2,
      pending: 1,
      band: 'high',
    })
    expect(result.trend.at(-1)?.medianLeadTimeHours).toBe(60)
  })

  it('never reports a negative lead time when commit dates are off', () => {
    const result = run({
      deploys: [deploy({ sha: 'bbbbbbb0000000000000' })],
      changes: [change({ firstCommitAt: '2026-11-19T00:00:00.000Z' })],
    })
    expect(repoSummary(result, API)?.leadTime.medianHours).toBe(0)
  })

  it('ignores changes of repositories outside the catalog', () => {
    const result = run({
      deploys: [deploy({ repo: 'lab-demo/outro', sha: 'bbbbbbb0000000000000' })],
      changes: [change({ repo: 'lab-demo/outro' })],
    })
    expect(result.summary.leadTime.changes).toBe(0)
    expect(result.summary.leadTime.pending).toBe(0)
  })
})

describe('time to restore', () => {
  it('takes the median of restored incidents and counts the open ones', () => {
    const result = run({
      incidents: [
        incident({ id: 'INC-1', endedAt: '2026-11-18T13:30:00.000Z' }),
        incident({ id: 'INC-2', endedAt: '2026-11-18T16:00:00.000Z' }),
        incident({ id: 'INC-3', endedAt: null }),
        incident({ id: 'INC-4', startedAt: '2026-01-10T10:00:00.000Z', endedAt: null }),
      ],
    })
    expect(repoSummary(result, API)?.timeToRestore).toEqual({
      medianHours: 1.75,
      restored: 2,
      open: 1,
      band: 'high',
    })
    expect(result.incidents.map((item) => [item.id, item.restoreHours])).toEqual([
      ['INC-1', 0.5],
      ['INC-2', 3],
      ['INC-3', null],
    ])
  })

  it('charges the causing repository, or every repository of the system without a cause', () => {
    const result = run({
      incidents: [
        incident({ id: 'INC-1', cause: { repo: WEB, sha: 'abcdef0' } }),
        incident({ id: 'INC-2' }),
        incident({ id: 'INC-3', system: 'outro' }),
        incident({ id: 'INC-4', cause: { repo: 'lab-demo/outro', sha: 'abcdef0' } }),
      ],
    })
    const reposOf = (id: string) => result.incidents.find((item) => item.id === id)?.repos
    expect(reposOf('INC-1')).toEqual([WEB])
    expect(reposOf('INC-2')).toEqual([API, WEB])
    expect(reposOf('INC-4')).toEqual([API, WEB])
    expect(reposOf('INC-3')).toBeUndefined()
    expect(repoSummary(result, API)?.timeToRestore.restored).toBe(2)
    expect(repoSummary(result, WEB)?.timeToRestore.restored).toBe(3)
    expect(repoSummary(result, WORKER)?.timeToRestore.restored).toBe(0)
    expect(result.teams.find((team) => team.team === 'Campanhas')?.summary.timeToRestore).toEqual({
      medianHours: 0.5,
      restored: 3,
      open: 0,
      band: 'elite',
    })
  })
})

describe('teams and filters', () => {
  const input = {
    deploys: [deploy(), deploy({ repo: WORKER, sha: 'abc1234' })],
    incidents: [incident({ system: 'notificacoes' })],
  }

  it('aggregates every repository of a team', () => {
    const result = run(input)
    expect(result.teams.map((team) => [team.team, team.repos])).toEqual([
      ['Campanhas', [API, WEB]],
      ['Mensageria', [WORKER]],
    ])
    expect(result.repos.map((entry) => entry.repo)).toEqual([API, WEB, WORKER])
  })

  it('scopes the summary, trend and lists to the team or repository selected', () => {
    const team = run({ ...input, filter: { team: 'Mensageria' } })
    expect(team.filter).toEqual({ team: 'Mensageria', repo: null })
    expect(team.summary.deploymentFrequency.deploys).toBe(1)
    expect(team.deploys.map((item) => item.repo)).toEqual([WORKER])
    expect(team.incidents).toHaveLength(1)
    expect(team.repos).toHaveLength(3)

    const repo = run({ ...input, filter: { repo: API } })
    expect(repo.filter).toEqual({ team: null, repo: API })
    expect(repo.deploys.map((item) => item.repo)).toEqual([API])
    expect(repo.incidents).toEqual([])
    expect(repo.trend.reduce((sum, point) => sum + point.deploys, 0)).toBe(1)
  })

  it('rejects a team or repository that is not in the catalog', () => {
    expect(() => run({ filter: { team: 'Ninguém' } })).toThrow(DoraFilterError)
    expect(() => run({ filter: { repo: 'lab-demo/outro' } })).toThrow(DoraFilterError)
  })

  it('lists at most 50 deploys, newest first', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      deploy({
        sha: `e${String(index).padStart(6, '0')}`,
        deployedAt: new Date(Date.parse('2026-11-01T00:00:00.000Z') + index * 3_600_000)
          .toISOString()
          .replace('.000Z', 'Z'),
      }),
    )
    const { deploys } = run({ deploys: many })
    expect(deploys).toHaveLength(50)
    expect(deploys[0]?.sha).toBe('e000059')
  })
})
