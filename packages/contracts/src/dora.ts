import { z } from 'zod'

const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/)
const nonNegativeInt = z.number().int().nonnegative()
const hours = z.number().nonnegative().nullable()

/** Performance clusters of the DORA report, from best to worst. */
export const DoraBandSchema = z.enum(['elite', 'high', 'medium', 'low'])
export type DoraBand = z.infer<typeof DoraBandSchema>

/** Filters of `GET /api/metrics/dora`: one team or one repository, over 4 to 26 weeks. */
export const DoraQuerySchema = z
  .object({
    team: z.string().trim().min(1).max(64).optional(),
    repo: repoName.optional(),
    weeks: z.coerce.number().int().min(4).max(26).default(12),
  })
  .refine((query) => !(query.team && query.repo), {
    message: 'use team or repo, not both',
  })
export type DoraQuery = z.infer<typeof DoraQuerySchema>

/**
 * The four DORA metrics of a scope. Rates are fractions from 0 to 1 and durations are hours.
 * A band is null when the scope has nothing to measure in the window.
 */
export const DoraSummarySchema = z.object({
  deploymentFrequency: z.object({
    deploys: nonNegativeInt,
    perWeek: z.number().nonnegative(),
    band: DoraBandSchema.nullable(),
  }),
  leadTime: z.object({
    medianHours: hours,
    changes: nonNegativeInt,
    pending: nonNegativeInt,
    band: DoraBandSchema.nullable(),
  }),
  changeFailureRate: z.object({
    failed: nonNegativeInt,
    deploys: nonNegativeInt,
    rate: z.number().min(0).max(1).nullable(),
    band: DoraBandSchema.nullable(),
  }),
  timeToRestore: z.object({
    medianHours: hours,
    restored: nonNegativeInt,
    open: nonNegativeInt,
    band: DoraBandSchema.nullable(),
  }),
})
export type DoraSummary = z.infer<typeof DoraSummarySchema>

export const DoraTrendPointSchema = z.object({
  weekStart: z.iso.datetime(),
  deploys: nonNegativeInt,
  failed: nonNegativeInt,
  changeFailureRate: z.number().min(0).max(1).nullable(),
  medianLeadTimeHours: hours,
  medianRestoreHours: hours,
})
export type DoraTrendPoint = z.infer<typeof DoraTrendPointSchema>

export const DoraDeployStatusSchema = z.enum(['success', 'failure', 'rolled_back'])
export type DoraDeployStatus = z.infer<typeof DoraDeployStatusSchema>

export const DoraDeploySchema = z.object({
  repo: repoName,
  team: z.string(),
  environment: z.string(),
  sha: z.string(),
  deployedAt: z.iso.datetime(),
  status: DoraDeployStatusSchema,
  failed: z.boolean(),
  url: z.string().nullable(),
  incidentIds: z.array(z.string()),
})
export type DoraDeploy = z.infer<typeof DoraDeploySchema>

export const DoraIncidentSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  system: z.string(),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  restoreHours: hours,
  repos: z.array(repoName),
  cause: z.object({ repo: repoName, sha: z.string() }).nullable(),
})
export type DoraIncident = z.infer<typeof DoraIncidentSchema>

export const DoraRepoSummarySchema = z.object({
  repo: repoName,
  team: z.string(),
  system: z.string(),
  summary: DoraSummarySchema,
})
export type DoraRepoSummary = z.infer<typeof DoraRepoSummarySchema>

export const DoraTeamSummarySchema = z.object({
  team: z.string(),
  repos: z.array(repoName),
  summary: DoraSummarySchema,
})
export type DoraTeamSummary = z.infer<typeof DoraTeamSummarySchema>

/** Response of `GET /api/metrics/dora`; `summary`, `trend` and the lists follow the filter. */
export const DoraMetricsResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  window: z.object({ from: z.iso.datetime(), to: z.iso.datetime(), weeks: z.number().int() }),
  filter: z.object({ team: z.string().nullable(), repo: repoName.nullable() }),
  summary: DoraSummarySchema,
  trend: z.array(DoraTrendPointSchema),
  repos: z.array(DoraRepoSummarySchema),
  teams: z.array(DoraTeamSummarySchema),
  deploys: z.array(DoraDeploySchema),
  incidents: z.array(DoraIncidentSchema),
})
export type DoraMetricsResponse = z.infer<typeof DoraMetricsResponseSchema>
