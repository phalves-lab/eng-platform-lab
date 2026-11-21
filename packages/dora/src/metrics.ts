import type {
  DoraDeploy,
  DoraIncident,
  DoraMetricsResponse,
  DoraSummary,
  DoraTrendPoint,
} from '@lab/contracts'
import type { Change, Deploy, Incident } from '@lab/database'
import { changeFailureBand, deploymentFrequencyBand, leadTimeBand, restoreBand } from './bands.js'
import type { DoraRepo } from './catalog.js'

export interface DoraFilter {
  team?: string | undefined
  repo?: string | undefined
}

export interface DoraInput {
  repos: DoraRepo[]
  deploys: Deploy[]
  changes: Change[]
  incidents: Incident[]
  now: string
  weeks: number
  filter?: DoraFilter
}

export class DoraFilterError extends Error {
  override readonly name = 'DoraFilterError'
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const DEPLOY_LIST_LIMIT = 50

interface ProductionDeploy extends Deploy {
  team: string
  at: number
  reachedProduction: boolean
  failed: boolean
  incidentIds: string[]
}

interface ShippedChange {
  repo: string
  mergedAt: number
  shippedAt: number | null
  leadHours: number | null
}

interface MeasuredIncident {
  incident: Incident
  repos: string[]
  startedAt: number
  restoreHours: number | null
}

interface Range {
  from: number
  to: number
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Start of the ISO week (Monday, 00:00 UTC) that contains `time`. */
export const weekStart = (time: number): number => {
  const date = new Date(time)
  const day = date.getUTCDay()
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return midnight - ((day + 6) % 7) * DAY
}

/** First instant of a window of `weeks` calendar weeks that ends in the week of `now`. */
export const windowStart = (now: number, weeks: number): number =>
  weekStart(now) - (weeks - 1) * WEEK

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
      : (sorted[middle] as number)
  return round(value)
}

/** Short and full SHAs of the same commit match, as long as the shorter one has 7 characters. */
const sameCommit = (a: string, b: string) =>
  Math.min(a.length, b.length) >= 7 && (a.startsWith(b) || b.startsWith(a))

const within = (time: number, range: Range) => time >= range.from && time < range.to

const causedBy = (incident: Incident, deploy: Deploy) =>
  incident.cause !== null &&
  incident.cause.repo === deploy.repo &&
  sameCommit(incident.cause.sha, deploy.sha)

/**
 * An incident counts for the repository of its causing deploy when it names one; otherwise for
 * every measured repository of the affected system.
 */
const incidentRepos = (incident: Incident, repos: DoraRepo[]): string[] => {
  const cause = incident.cause
  if (cause && repos.some((entry) => entry.repo === cause.repo)) return [cause.repo]
  return repos
    .filter((entry) => entry.system === incident.system)
    .map((entry) => entry.repo)
    .sort()
}

/**
 * Production deploys of the measured repositories, oldest first. A `failure` deploy never
 * reached production, so it stays out of frequency and failure rate; a deploy that reached
 * production fails when it was rolled back or an incident names it as the cause.
 */
const productionDeploys = (input: DoraInput): ProductionDeploy[] => {
  const repos = new Map(input.repos.map((entry) => [entry.repo, entry]))
  return input.deploys
    .flatMap((deploy) => {
      const entry = repos.get(deploy.repo)
      if (!entry || deploy.environment !== entry.productionEnvironment) return []
      const reachedProduction = deploy.status !== 'failure'
      const incidentIds = input.incidents
        .filter((incident) => causedBy(incident, deploy))
        .map((incident) => incident.id)
      return [
        {
          ...deploy,
          team: entry.team,
          at: Date.parse(deploy.deployedAt),
          reachedProduction,
          failed: reachedProduction && (deploy.status === 'rolled_back' || incidentIds.length > 0),
          incidentIds,
        },
      ]
    })
    .sort((a, b) => a.at - b.at)
}

const ships = (deploy: ProductionDeploy, change: Change) =>
  deploy.repo === change.repo &&
  (sameCommit(deploy.sha, change.mergeSha) ||
    deploy.commitShas.some((sha) => sameCommit(sha, change.mergeSha)))

/** Lead time runs from the first commit of the pull request to the first deploy that ships it. */
const shippedChanges = (changes: Change[], deploys: ProductionDeploy[]): ShippedChange[] =>
  changes.map((change) => {
    const deploy = deploys.find(
      (candidate) => candidate.reachedProduction && ships(candidate, change),
    )
    const shippedAt = deploy?.at ?? null
    return {
      repo: change.repo,
      mergedAt: Date.parse(change.mergedAt),
      shippedAt,
      leadHours:
        shippedAt === null
          ? null
          : round(Math.max(0, shippedAt - Date.parse(change.firstCommitAt)) / HOUR),
    }
  })

const measureIncidents = (incidents: Incident[], repos: DoraRepo[]): MeasuredIncident[] =>
  incidents.map((incident) => {
    const startedAt = Date.parse(incident.startedAt)
    return {
      incident,
      repos: incidentRepos(incident, repos),
      startedAt,
      restoreHours:
        incident.endedAt === null ? null : round((Date.parse(incident.endedAt) - startedAt) / HOUR),
    }
  })

interface Measured {
  deploys: ProductionDeploy[]
  changes: ShippedChange[]
  incidents: MeasuredIncident[]
}

const scoped = (measured: Measured, repos: Set<string>): Measured => ({
  deploys: measured.deploys.filter((deploy) => repos.has(deploy.repo)),
  changes: measured.changes.filter((change) => repos.has(change.repo)),
  incidents: measured.incidents.filter((item) => item.repos.some((repo) => repos.has(repo))),
})

const deliveredIn = (measured: Measured, range: Range) => {
  const deploys = measured.deploys.filter(
    (deploy) => deploy.reachedProduction && within(deploy.at, range),
  )
  const leadHours = measured.changes.flatMap((change) =>
    change.shippedAt !== null && change.leadHours !== null && within(change.shippedAt, range)
      ? [change.leadHours]
      : [],
  )
  const incidents = measured.incidents.filter((item) => within(item.startedAt, range))
  const restoreHours = incidents.flatMap((item) =>
    item.restoreHours === null ? [] : [item.restoreHours],
  )
  const failed = deploys.filter((deploy) => deploy.failed).length
  return { deploys, failed, leadHours, incidents, restoreHours }
}

const summarize = (measured: Measured, range: Range): DoraSummary => {
  const { deploys, failed, leadHours, incidents, restoreHours } = deliveredIn(measured, range)
  const days = (range.to - range.from) / DAY
  const perDay = days > 0 ? deploys.length / days : 0
  const leadMedian = median(leadHours)
  const restoreMedian = median(restoreHours)
  const rate = deploys.length ? round(failed / deploys.length, 4) : null
  const pending = measured.changes.filter(
    (change) => change.shippedAt === null && within(change.mergedAt, range),
  ).length
  return {
    deploymentFrequency: {
      deploys: deploys.length,
      perWeek: round(perDay * 7),
      band: deploys.length ? deploymentFrequencyBand(perDay) : null,
    },
    leadTime: {
      medianHours: leadMedian,
      changes: leadHours.length,
      pending,
      band: leadMedian === null ? null : leadTimeBand(leadMedian),
    },
    changeFailureRate: {
      failed,
      deploys: deploys.length,
      rate,
      band: rate === null ? null : changeFailureBand(rate),
    },
    timeToRestore: {
      medianHours: restoreMedian,
      restored: restoreHours.length,
      open: incidents.length - restoreHours.length,
      band: restoreMedian === null ? null : restoreBand(restoreMedian),
    },
  }
}

const trend = (measured: Measured, range: Range, weeks: number): DoraTrendPoint[] =>
  Array.from({ length: weeks }, (_, index) => {
    const from = range.from + index * WEEK
    const week = deliveredIn(measured, { from, to: Math.min(from + WEEK, range.to) })
    return {
      weekStart: new Date(from).toISOString(),
      deploys: week.deploys.length,
      failed: week.failed,
      changeFailureRate: week.deploys.length ? round(week.failed / week.deploys.length, 4) : null,
      medianLeadTimeHours: median(week.leadHours),
      medianRestoreHours: median(week.restoreHours),
    }
  })

const selectRepos = (repos: DoraRepo[], filter: DoraFilter): string[] => {
  if (filter.repo) {
    if (!repos.some((entry) => entry.repo === filter.repo)) {
      throw new DoraFilterError(`Repositório ${filter.repo} não está no catálogo DORA`)
    }
    return [filter.repo]
  }
  if (filter.team) {
    const team = repos.filter((entry) => entry.team === filter.team).map((entry) => entry.repo)
    if (team.length === 0) throw new DoraFilterError(`Time ${filter.team} não está no catálogo`)
    return team
  }
  return repos.map((entry) => entry.repo)
}

const toDeploy = (deploy: ProductionDeploy): DoraDeploy => ({
  repo: deploy.repo,
  team: deploy.team,
  environment: deploy.environment,
  sha: deploy.sha,
  deployedAt: deploy.deployedAt,
  status: deploy.status,
  failed: deploy.failed,
  url: deploy.url,
  incidentIds: deploy.incidentIds,
})

const toIncident = (item: MeasuredIncident): DoraIncident => ({
  id: item.incident.id,
  title: item.incident.title,
  system: item.incident.system,
  severity: item.incident.severity,
  startedAt: item.incident.startedAt,
  endedAt: item.incident.endedAt,
  restoreHours: item.restoreHours,
  repos: item.repos,
  cause: item.incident.cause,
})

const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/**
 * Computes the four DORA metrics over the last `weeks` calendar weeks (Monday to Sunday, UTC,
 * the current one included) for every repository and team of the catalog, plus the trend and
 * the deploy and incident lists of the selected team or repository.
 */
export const computeDora = (input: DoraInput): DoraMetricsResponse => {
  const filter = input.filter ?? {}
  const selected = new Set(selectRepos(input.repos, filter))
  const now = Date.parse(input.now)
  const range = { from: windowStart(now, input.weeks), to: now + 1 }
  const deploys = productionDeploys(input)
  const measured: Measured = {
    deploys,
    changes: shippedChanges(
      input.changes.filter((change) => input.repos.some((entry) => entry.repo === change.repo)),
      deploys,
    ),
    incidents: measureIncidents(input.incidents, input.repos),
  }
  const selection = scoped(measured, selected)
  const teams = [...new Set(input.repos.map((entry) => entry.team))].sort(byName)

  return {
    generatedAt: new Date(now).toISOString(),
    window: {
      from: new Date(range.from).toISOString(),
      to: new Date(now).toISOString(),
      weeks: input.weeks,
    },
    filter: { team: filter.team ?? null, repo: filter.repo ?? null },
    summary: summarize(selection, range),
    trend: trend(selection, range, input.weeks),
    repos: input.repos
      .toSorted((a, b) => byName(a.repo, b.repo))
      .map((entry) => ({
        repo: entry.repo,
        team: entry.team,
        system: entry.system,
        summary: summarize(scoped(measured, new Set([entry.repo])), range),
      })),
    teams: teams.map((team) => {
      const repos = input.repos
        .filter((entry) => entry.team === team)
        .map((entry) => entry.repo)
        .sort(byName)
      return { team, repos, summary: summarize(scoped(measured, new Set(repos)), range) }
    }),
    deploys: selection.deploys
      .filter((deploy) => within(deploy.at, range))
      .toReversed()
      .slice(0, DEPLOY_LIST_LIMIT)
      .map(toDeploy),
    incidents: selection.incidents
      .filter((item) => within(item.startedAt, range))
      .sort((a, b) => b.startedAt - a.startedAt || byName(a.incident.id, b.incident.id))
      .map(toIncident),
  }
}
