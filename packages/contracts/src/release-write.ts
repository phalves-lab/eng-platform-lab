import { z } from 'zod'
import {
  BranchNameSchema,
  ReleaseChecksSchema,
  ReleaseDeployOrderSchema,
  ReleaseSideFilterSchema,
  ReleaseSideSchema,
  RepositorySchema,
} from './releases.js'

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/, 'hash do plano inválido')
const ConfirmSchema = z.array(z.string().trim().max(200)).min(1).max(2)

/** Body of `POST /api/releases/plan`; branches fall back to the project defaults. */
export const ReleasePlanRequestSchema = z
  .object({
    project: z.string().trim().min(1),
    side: ReleaseSideFilterSchema.default('both'),
    source: BranchNameSchema.optional(),
    target: BranchNameSchema.optional(),
  })
  .refine(
    (request) => !request.source || !request.target || request.source !== request.target,
    'origem e destino iguais',
  )
export type ReleasePlanRequest = z.infer<typeof ReleasePlanRequestSchema>

/**
 * Body of `POST /api/releases/execute`: the same request as the plan, the plan hash the person saw
 * and every repository name typed by hand.
 */
export const ReleaseExecuteRequestSchema = z
  .object({
    project: z.string().trim().min(1),
    side: ReleaseSideFilterSchema.default('both'),
    source: BranchNameSchema.optional(),
    target: BranchNameSchema.optional(),
    hash: HashSchema,
    confirm: ConfirmSchema,
  })
  .refine(
    (request) => !request.source || !request.target || request.source !== request.target,
    'origem e destino iguais',
  )
export type ReleaseExecuteRequest = z.infer<typeof ReleaseExecuteRequestSchema>

/** One write the portal will make on GitHub, in execution order. */
export const ReleaseWriteStepSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create-branch'),
    repo: z.string(),
    branch: z.string(),
    from: z.string(),
    sha: z.string(),
  }),
  z.object({
    kind: z.literal('reuse-branch'),
    repo: z.string(),
    branch: z.string(),
    sha: z.string(),
  }),
  z.object({
    kind: z.literal('create-pull'),
    repo: z.string(),
    head: z.string(),
    base: z.string(),
    title: z.string(),
    body: z.string(),
  }),
  z.object({
    kind: z.literal('update-pull'),
    repo: z.string(),
    number: z.number().int(),
    url: z.string(),
    body: z.string(),
  }),
  z.object({ kind: z.literal('add-labels'), repo: z.string(), labels: z.array(z.string()) }),
  z.object({ kind: z.literal('add-assignees'), repo: z.string(), logins: z.array(z.string()) }),
  z.object({ kind: z.literal('link-pulls'), repos: z.array(z.string()) }),
  z.object({ kind: z.literal('create-tag'), repo: z.string(), tag: z.string(), sha: z.string() }),
  z.object({
    kind: z.literal('create-release'),
    repo: z.string(),
    tag: z.string(),
    name: z.string(),
    body: z.string(),
  }),
])
export type ReleaseWriteStep = z.infer<typeof ReleaseWriteStepSchema>

export const ReleaseChecklistSqlSchema = z.object({
  sides: z.array(ReleaseSideSchema),
  repo: z.string(),
  key: z.string().nullable(),
  pulls: z.array(z.number().int()),
  sql: z.string(),
})
export type ReleaseChecklistSql = z.infer<typeof ReleaseChecklistSqlSchema>

export const ReleaseChecklistEnvSchema = z.object({
  sides: z.array(ReleaseSideSchema),
  repo: z.string(),
  key: z.string().nullable(),
  names: z.array(z.string()),
  notes: z.array(z.string()),
})
export type ReleaseChecklistEnv = z.infer<typeof ReleaseChecklistEnvSchema>

export const ReleaseChecklistSchema = z.object({
  sql: z.array(ReleaseChecklistSqlSchema),
  env: z.array(ReleaseChecklistEnvSchema),
})
export type ReleaseChecklist = z.infer<typeof ReleaseChecklistSchema>

/** One release PR of the plan; a monorepo gets a single PR that covers both sides. */
export const ReleasePlanPullSchema = z.object({
  sides: z.array(ReleaseSideSchema),
  repo: z.string(),
  head: z.string(),
  base: z.string(),
  sha: z.string(),
  branch: z.object({ name: z.string(), action: z.enum(['create', 'reuse']) }).nullable(),
  existing: z.object({ number: z.number().int(), url: z.string() }).nullable(),
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  tickets: z.number().int(),
  pulls: z.number().int(),
})
export type ReleasePlanPull = z.infer<typeof ReleasePlanPullSchema>

export const ReleasePlanSchema = z.object({
  kind: z.literal('release'),
  project: z.object({ id: z.string(), name: z.string(), mode: z.enum(['pr', 'branch']) }),
  side: ReleaseSideFilterSchema,
  source: z.string(),
  target: z.string(),
  generatedAt: z.string(),
  pulls: z.array(ReleasePlanPullSchema),
  steps: z.array(ReleaseWriteStepSchema),
  checklist: ReleaseChecklistSchema,
  deployOrder: ReleaseDeployOrderSchema.nullable(),
  blockers: z.array(z.string()),
  confirm: z.array(z.string()),
  hash: HashSchema,
  writeEnabled: z.boolean(),
})
export type ReleasePlan = z.infer<typeof ReleasePlanSchema>

/** Body of `POST /api/releases/publish/plan`: a merged release PR opened by the portal. */
export const ReleasePublishRequestSchema = z.object({
  project: z.string().trim().min(1),
  repo: RepositorySchema,
  number: z.number().int().positive(),
})
export type ReleasePublishRequest = z.infer<typeof ReleasePublishRequestSchema>

export const ReleasePublishExecuteSchema = ReleasePublishRequestSchema.extend({
  hash: HashSchema,
  confirm: ConfirmSchema,
})
export type ReleasePublishExecute = z.infer<typeof ReleasePublishExecuteSchema>

export const ReleasePublishPlanSchema = z.object({
  kind: z.literal('publish'),
  project: z.object({ id: z.string(), name: z.string() }),
  repo: z.string(),
  number: z.number().int(),
  pullUrl: z.string(),
  tag: z.string(),
  sha: z.string(),
  name: z.string(),
  body: z.string(),
  generatedAt: z.string(),
  steps: z.array(ReleaseWriteStepSchema),
  blockers: z.array(z.string()),
  confirm: z.array(z.string()),
  hash: HashSchema,
  writeEnabled: z.boolean(),
})
export type ReleasePublishPlan = z.infer<typeof ReleasePublishPlanSchema>

export const ReleaseRunPullSchema = z.object({
  sides: z.array(ReleaseSideSchema),
  repo: z.string(),
  number: z.number().int(),
  url: z.string(),
  action: z.enum(['created', 'updated']),
})
export type ReleaseRunPull = z.infer<typeof ReleaseRunPullSchema>

/** What one execution did on GitHub; a failed run keeps what was written before the error. */
export const ReleaseRunResultSchema = z.object({
  status: z.enum(['success', 'failed', 'rejected']),
  pulls: z.array(ReleaseRunPullSchema),
  branches: z.array(z.object({ repo: z.string(), name: z.string() })),
  release: z
    .object({ repo: z.string(), number: z.number().int(), tag: z.string(), url: z.string() })
    .nullable(),
  completed: z.number().int(),
  total: z.number().int(),
  error: z.string().nullable(),
})
export type ReleaseRunResult = z.infer<typeof ReleaseRunResultSchema>

export const ReleaseExecuteResponseSchema = ReleaseRunResultSchema.extend({
  runId: z.number().int(),
})
export type ReleaseExecuteResponse = z.infer<typeof ReleaseExecuteResponseSchema>

/** Audit entry of one execution attempt, as shown in the project history. */
export const ReleaseRunSchema = z.object({
  id: z.number().int(),
  projectId: z.string(),
  action: z.enum(['release', 'publish']),
  actor: z.string(),
  role: z.enum(['dev', 'lead', 'admin']),
  planHash: z.string(),
  createdAt: z.string(),
  result: ReleaseRunResultSchema,
})
export type ReleaseRun = z.infer<typeof ReleaseRunSchema>

export const ReleaseSummaryRunSchema = z.object({
  state: z.enum(['success', 'failure', 'pending', 'none']),
  url: z.string().nullable(),
})
export type ReleaseSummaryRun = z.infer<typeof ReleaseSummaryRunSchema>

/** A release PR opened by the portal and where it stands: AI summary, CI, reviews and merge. */
export const ReleaseTrackedPullSchema = z.object({
  lastRunId: z.number().int(),
  lastRunAt: z.string(),
  lastRunBy: z.string(),
  sides: z.array(ReleaseSideSchema),
  repo: z.string(),
  number: z.number().int(),
  url: z.string(),
  title: z.string(),
  state: z.enum(['open', 'merged', 'closed']),
  mergeable: z.boolean().nullable(),
  mergedAt: z.string().nullable(),
  mergeSha: z.string().nullable(),
  summary: ReleaseSummaryRunSchema,
  checks: ReleaseChecksSchema,
  approvals: z.object({ approved: z.array(z.string()), changesRequested: z.array(z.string()) }),
  published: z.object({ tag: z.string(), url: z.string() }).nullable(),
})
export type ReleaseTrackedPull = z.infer<typeof ReleaseTrackedPullSchema>

export const ReleaseTrackingSchema = z.object({
  project: z.object({ id: z.string(), name: z.string() }),
  generatedAt: z.string(),
  writeEnabled: z.boolean(),
  pulls: z.array(ReleaseTrackedPullSchema),
})
export type ReleaseTracking = z.infer<typeof ReleaseTrackingSchema>

export const ReleaseProjectQuerySchema = z.object({ project: z.string().trim().min(1) })
export type ReleaseProjectQuery = z.infer<typeof ReleaseProjectQuerySchema>
