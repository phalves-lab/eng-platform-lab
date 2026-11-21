import { describe, expect, it } from 'vitest'
import { NO_DATA } from '../src/lib/delivery'
import {
  BAND_LABEL,
  bandBadge,
  deployBadge,
  doraTrendSeries,
  filterOptions,
  formatDoraTrendValue,
  formatDuration,
  formatPerWeek,
  formatPerWeekShort,
  formatRate,
  hasDeploys,
  hasDurations,
  leadTimeHint,
  parseFilter,
  repoShortName,
  restoreHint,
  shortSha,
} from '../src/lib/dora'

const summary = {
  deploymentFrequency: { deploys: 0, perWeek: 0, band: null },
  leadTime: { medianHours: null, changes: 0, pending: 0, band: null },
  changeFailureRate: { failed: 0, deploys: 0, rate: null, band: null },
  timeToRestore: { medianHours: null, restored: 0, open: 0, band: null },
}

describe('DORA labels', () => {
  it('maps each band to its label and tone, and missing data to a neutral badge', () => {
    expect(Object.values(BAND_LABEL)).toEqual(['Elite', 'Alta', 'Média', 'Baixa'])
    expect(bandBadge('elite')).toEqual({ label: 'Elite', tone: 'success' })
    expect(bandBadge('low')).toEqual({ label: 'Baixa', tone: 'danger' })
    expect(bandBadge(null)).toEqual({ label: 'Sem dado', tone: 'secondary' })
  })

  it('formats durations in minutes, hours or days, and rates in percent', () => {
    expect(formatDuration(null)).toBe(NO_DATA)
    expect(formatDuration(0.71)).toBe('43 min')
    expect(formatDuration(17.3)).toBe('17,3 h')
    expect(formatDuration(47.9)).toBe('47,9 h')
    expect(formatDuration(48)).toBe('2 dias')
    expect(formatDuration(380.45)).toBe('15,9 dias')
    expect(formatRate(null)).toBe(NO_DATA)
    expect(formatRate(0.0833)).toBe('8,3%')
    expect(formatPerWeek(8.99)).toBe('9 por semana')
    expect(formatPerWeek(0.68)).toBe('0,7 por semana')
    expect(shortSha('40d0c985ffca')).toBe('40d0c98')
  })
})

describe('DORA filters', () => {
  const teams = [{ team: 'Campanhas', repos: ['lab-demo/campanhas-api'], summary }]
  const repos = [
    { repo: 'lab-demo/campanhas-api', team: 'Campanhas', system: 'campanhas', summary },
  ]

  it('builds links for everything, each team and each repository', () => {
    const options = filterOptions('/entregas/dora', teams, repos, { team: null, repo: null })
    expect(options.teams.map((option) => [option.label, option.href, option.active])).toEqual([
      ['Todos', '/entregas/dora', true],
      ['Campanhas', '/entregas/dora?time=Campanhas', false],
    ])
    expect(options.repos).toEqual([
      {
        key: 'lab-demo/campanhas-api',
        label: 'campanhas-api',
        href: '/entregas/dora?repo=lab-demo%2Fcampanhas-api',
        active: false,
      },
    ])
    const team = filterOptions('/entregas/dora', teams, repos, { team: 'Campanhas', repo: null })
    expect(team.teams.map((option) => option.active)).toEqual([false, true])
  })

  it('reads one filter from the query string, team first', () => {
    expect(parseFilter({})).toEqual({})
    expect(parseFilter({ time: ' Campanhas ', repo: 'lab-demo/x' })).toEqual({ team: 'Campanhas' })
    expect(parseFilter({ time: ' ', repo: 'lab-demo/x' })).toEqual({ repo: 'lab-demo/x' })
  })
})

describe('DORA trend', () => {
  const point = (weekStart: string, deploys: number, failed: number) => ({
    weekStart,
    deploys,
    failed,
    changeFailureRate: deploys ? failed / deploys : null,
    medianLeadTimeHours: deploys ? 12 : null,
    medianRestoreHours: null,
  })

  it('splits deploys into ok and failed per week', () => {
    const trend = [point('2026-11-09T00:00:00.000Z', 4, 1), point('2026-11-16T00:00:00.000Z', 0, 0)]
    expect(doraTrendSeries(trend)).toEqual([
      { week: '09/11', ok: 3, failed: 1, lead: 12, restore: null },
      { week: '16/11', ok: 0, failed: 0, lead: null, restore: null },
    ])
    expect(hasDeploys(trend)).toBe(true)
    expect(hasDeploys([trend[1] as (typeof trend)[number]])).toBe(false)
  })

  it('formats tooltip values per series', () => {
    expect(formatDoraTrendValue('ok', 1)).toBe('1 deploy')
    expect(formatDoraTrendValue('failed', 3)).toBe('3 deploys')
    expect(formatDoraTrendValue('failed', undefined)).toBe(NO_DATA)
    expect(formatDoraTrendValue('lead', 30)).toBe('30 h')
    expect(formatDoraTrendValue('restore', null)).toBe(NO_DATA)
  })
})

describe('DORA hints', () => {
  it('mentions pending changes and open incidents only when there are any', () => {
    expect(leadTimeHint({ medianHours: 3, changes: 1, pending: 0, band: 'elite' })).toBe(
      'Mediana de 1 PR, do 1º commit ao deploy',
    )
    expect(leadTimeHint({ medianHours: 3, changes: 4, pending: 2, band: 'elite' })).toBe(
      'Mediana de 4 PRs, do 1º commit ao deploy; 2 aguardando deploy',
    )
    expect(restoreHint({ medianHours: 1, restored: 2, open: 0, band: 'high' })).toBe(
      'Mediana de 2 incidentes',
    )
    expect(restoreHint({ medianHours: null, restored: 0, open: 1, band: null })).toBe(
      'Mediana de 0 incidentes; 1 em aberto',
    )
    expect(hasDurations(doraTrendSeries([]))).toBe(false)
    expect(hasDurations([{ week: '16/11', ok: 0, failed: 0, lead: null, restore: 2 }])).toBe(true)
  })
})

describe('DORA deploys', () => {
  const deploy = {
    repo: 'lab-demo/campanhas-api',
    team: 'Campanhas',
    environment: 'production',
    sha: 'abc1234',
    deployedAt: '2026-11-20T12:00:00.000Z',
    status: 'success' as const,
    failed: false,
    url: null,
    incidentIds: [],
  }

  it('shows a deploy that caused an incident as a failure', () => {
    expect(deployBadge(deploy)).toEqual({ label: 'Sucesso', tone: 'success' })
    expect(deployBadge({ ...deploy, failed: true })).toEqual({
      label: 'Causou incidente',
      tone: 'danger',
    })
    expect(deployBadge({ ...deploy, status: 'rolled_back', failed: true })).toEqual({
      label: 'Revertido',
      tone: 'danger',
    })
    expect(deployBadge({ ...deploy, status: 'failure' })).toEqual({
      label: 'Pipeline falhou',
      tone: 'warning',
    })
    expect(repoShortName('lab-demo/campanhas-api')).toBe('campanhas-api')
    expect(repoShortName('solto')).toBe('solto')
    expect(formatPerWeekShort(12.73)).toBe('12,7/sem.')
  })
})
