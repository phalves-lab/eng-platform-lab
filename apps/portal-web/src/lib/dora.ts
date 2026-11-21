import type {
  DoraBand,
  DoraDeploy,
  DoraDeployStatus,
  DoraIncident,
  DoraRepoSummary,
  DoraSummary,
  DoraTeamSummary,
  DoraTrendPoint,
} from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'
import { formatCount, formatWeek, NO_DATA } from '@/lib/delivery'

export const BAND_LABEL: Record<DoraBand, string> = {
  elite: 'Elite',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

const BAND_TONE: Record<DoraBand, BadgeTone> = {
  elite: 'success',
  high: 'info',
  medium: 'warning',
  low: 'danger',
}

export const bandBadge = (band: DoraBand | null): { label: string; tone: BadgeTone } =>
  band === null
    ? { label: 'Sem dado', tone: 'secondary' }
    : { label: BAND_LABEL[band], tone: BAND_TONE[band] }

const DEPLOY_STATUS_LABEL: Record<DoraDeployStatus, string> = {
  success: 'Sucesso',
  failure: 'Pipeline falhou',
  rolled_back: 'Revertido',
}

export const SEVERITY_TONE: Record<DoraIncident['severity'], BadgeTone> = {
  sev1: 'danger',
  sev2: 'danger',
  sev3: 'warning',
  sev4: 'secondary',
}

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const rate = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

/** Minutes under an hour, hours up to two days, days beyond that. */
export const formatDuration = (hours: number | null) => {
  if (hours === null) return NO_DATA
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${decimal.format(hours)} h`
  const days = hours / 24
  return `${decimal.format(days)} ${days < 2 ? 'dia' : 'dias'}`
}

export const formatRate = (value: number | null) => (value === null ? NO_DATA : rate.format(value))

export const formatPerWeek = (perWeek: number) => `${decimal.format(perWeek)} por semana`

export const shortSha = (sha: string) => sha.slice(0, 7)

export const repoShortName = (repo: string) => repo.split('/')[1] ?? repo

/** A deploy that went out fine but later caused an incident reads as a failure, not a success. */
export const deployBadge = (deploy: DoraDeploy): { label: string; tone: BadgeTone } => {
  if (deploy.failed && deploy.status === 'success')
    return { label: 'Causou incidente', tone: 'danger' }
  if (deploy.failed) return { label: DEPLOY_STATUS_LABEL[deploy.status], tone: 'danger' }
  if (deploy.status === 'failure') return { label: DEPLOY_STATUS_LABEL.failure, tone: 'warning' }
  return { label: DEPLOY_STATUS_LABEL.success, tone: 'success' }
}

export const formatPerWeekShort = (perWeek: number) => `${decimal.format(perWeek)}/sem.`

export interface DoraFilterOption {
  key: string
  label: string
  href: string
  active: boolean
}

const filterHref = (basePath: string, params: Record<string, string>) => {
  const search = new URLSearchParams(params).toString()
  return search ? `${basePath}?${search}` : basePath
}

/** Links for the whole portfolio, each team and each repository; one of them is active. */
export const filterOptions = (
  basePath: string,
  teams: DoraTeamSummary[],
  repos: DoraRepoSummary[],
  current: { team: string | null; repo: string | null },
) => ({
  teams: [
    {
      key: 'all',
      label: 'Todos',
      href: basePath,
      active: current.team === null && current.repo === null,
    },
    ...teams.map((team) => ({
      key: team.team,
      label: team.team,
      href: filterHref(basePath, { time: team.team }),
      active: current.team === team.team,
    })),
  ] satisfies DoraFilterOption[],
  repos: repos.map((repo) => ({
    key: repo.repo,
    label: repoShortName(repo.repo),
    href: filterHref(basePath, { repo: repo.repo }),
    active: current.repo === repo.repo,
  })) satisfies DoraFilterOption[],
})

/** Reads the page filter from the query string; `time` wins when both are present. */
export const parseFilter = (params: { time?: string; repo?: string }) => {
  const team = params.time?.trim()
  if (team) return { team }
  const repo = params.repo?.trim()
  return repo ? { repo } : {}
}

export interface DoraTrendDatum {
  week: string
  ok: number
  failed: number
  lead: number | null
  restore: number | null
}

export const doraTrendSeries = (trend: DoraTrendPoint[]): DoraTrendDatum[] =>
  trend.map((point) => ({
    week: formatWeek(point.weekStart),
    ok: point.deploys - point.failed,
    failed: point.failed,
    lead: point.medianLeadTimeHours,
    restore: point.medianRestoreHours,
  }))

export const hasDeploys = (trend: DoraTrendPoint[]) => trend.some((point) => point.deploys > 0)

export const hasDurations = (trend: DoraTrendDatum[]) =>
  trend.some((point) => point.lead !== null || point.restore !== null)

export const formatDoraTrendValue = (
  series: keyof Omit<DoraTrendDatum, 'week'>,
  value: unknown,
) => {
  const amount = typeof value === 'number' ? value : null
  if (series === 'lead' || series === 'restore') return formatDuration(amount)
  return amount === null ? NO_DATA : formatCount(amount, 'deploy', 'deploys')
}

/** Median sample size, plus the changes merged but not deployed yet when there are any. */
export const leadTimeHint = ({ changes, pending }: DoraSummary['leadTime']) => {
  const base = `Mediana de ${formatCount(changes, 'PR', 'PRs')}, do 1º commit ao deploy`
  return pending ? `${base}; ${pending} aguardando deploy` : base
}

export const restoreHint = ({ restored, open }: DoraSummary['timeToRestore']) => {
  const base = `Mediana de ${formatCount(restored, 'incidente', 'incidentes')}`
  return open ? `${base}; ${open} em aberto` : base
}
