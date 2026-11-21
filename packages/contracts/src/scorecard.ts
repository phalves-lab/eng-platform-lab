import { z } from 'zod'
import { BranchNameSchema, RepositorySchema } from './releases.js'

export const SCORECARD_CHECK_IDS = [
  'branch-protection',
  'merge-queue',
  'reusable-ci',
  'coverage',
  'agents-md',
  'secret-scanning',
  'node-version',
  'dependabot-alerts',
  'code-scanning-alerts',
  'release-flow',
] as const

export const ScorecardCheckIdSchema = z.enum(SCORECARD_CHECK_IDS)
export type ScorecardCheckId = z.infer<typeof ScorecardCheckIdSchema>

const StandardIdSchema = z.string().regex(/^[A-Z]+(?:-[A-Z]+)?-\d+$/, 'ID de padrão do handbook')

/**
 * Repository tracked by the scorecard, as declared in `catalog/repos/*.yaml`. `source: fixture`
 * keeps a fictitious repository on its synthetic fixture even when the collector reads GitHub.
 */
export const RepoCatalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id em kebab-case'),
  repo: RepositorySchema,
  name: z.string().trim().min(1),
  team: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  source: z.enum(['github', 'fixture']).default('github'),
  integrationBranch: BranchNameSchema.default('develop'),
})
export type RepoCatalogEntry = z.infer<typeof RepoCatalogEntrySchema>

const CheckPolicySchema = z.object({
  weight: z.number().int().min(0).max(100),
  standard: StandardIdSchema,
})

const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type AlertSeverity = z.infer<typeof SeveritySchema>

/** Scorecard rules versioned in `catalog/scorecard/policy.yaml`. Every check must be weighted. */
export const ScorecardPolicySchema = z
  .object({
    checks: z.record(ScorecardCheckIdSchema, CheckPolicySchema),
    nodeMajors: z.array(z.number().int().positive()).min(1),
    agentsMaxAgeDays: z.number().int().positive().default(90),
    alertPenalty: z.record(SeveritySchema, z.number().int().min(0).max(100)),
    coverageMarkers: z.array(z.string().trim().min(1)).min(1),
    releaseWorkflow: z.string().trim().min(1).default('release-summary.yml'),
    releaseLabels: z.array(z.string().trim().min(1)).default(['release', 'pre-release-notes']),
    levels: z
      .object({ good: z.number().int().min(1).max(100), attention: z.number().int().min(0) })
      .refine((levels) => levels.attention < levels.good, 'attention fica abaixo de good')
      .default({ good: 80, attention: 50 }),
  })
  .refine(
    (policy) => Object.values(policy.checks).reduce((sum, check) => sum + check.weight, 0) > 0,
    'a soma dos pesos precisa ser maior que zero',
  )
export type ScorecardPolicy = z.infer<typeof ScorecardPolicySchema>

export const CheckStatusSchema = z.enum(['pass', 'partial', 'fail', 'unknown'])
export type CheckStatus = z.infer<typeof CheckStatusSchema>

export const ScoreLevelSchema = z.enum(['good', 'attention', 'critical', 'unknown'])
export type ScoreLevel = z.infer<typeof ScoreLevelSchema>

export const ScorecardCheckSchema = z.object({
  id: ScorecardCheckIdSchema,
  title: z.string(),
  weight: z.number().int().min(0),
  standardId: StandardIdSchema,
  status: CheckStatusSchema,
  score: z.number().min(0).max(100).nullable(),
  detail: z.string(),
  fix: z.string().nullable(),
})
export type ScorecardCheck = z.infer<typeof ScorecardCheckSchema>

export const RepoScorecardSchema = z.object({
  id: z.string(),
  repo: RepositorySchema,
  name: z.string(),
  team: z.string(),
  description: z.string().nullable(),
  url: z.url().nullable(),
  source: z.enum(['github', 'fixture']),
  score: z.number().min(0).max(100).nullable(),
  level: ScoreLevelSchema,
  checks: z.array(ScorecardCheckSchema),
  error: z.string().nullable(),
})
export type RepoScorecard = z.infer<typeof RepoScorecardSchema>

/** File written by the scorecard collector and served by `GET /api/quality/scorecard`. */
export const ScorecardReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  repos: z.array(RepoScorecardSchema),
})
export type ScorecardReport = z.infer<typeof ScorecardReportSchema>

export const ScorecardFilterSchema = z.object({
  term: z.string().trim().min(1).optional(),
  level: ScoreLevelSchema.optional(),
})
export type ScorecardFilter = z.infer<typeof ScorecardFilterSchema>

export const ScorecardCheckViewSchema = ScorecardCheckSchema.extend({
  standardTitle: z.string().nullable(),
})
export type ScorecardCheckView = z.infer<typeof ScorecardCheckViewSchema>

export const RepoScorecardViewSchema = RepoScorecardSchema.extend({
  checks: z.array(ScorecardCheckViewSchema),
})
export type RepoScorecardView = z.infer<typeof RepoScorecardViewSchema>

export const ScorecardResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  total: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(100).nullable(),
  levels: z.record(ScoreLevelSchema, z.number().int().nonnegative()),
  repos: z.array(RepoScorecardViewSchema),
})
export type ScorecardResponse = z.infer<typeof ScorecardResponseSchema>
