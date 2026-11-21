import { z } from 'zod'
import { RepositorySchema } from './releases.js'

export const AiOriginSchema = z.enum(['bot', 'chat', 'golden-set'])
export type AiOrigin = z.infer<typeof AiOriginSchema>

export const EvalSuiteSchema = z.enum(['bot', 'chat'])
export type EvalSuite = z.infer<typeof EvalSuiteSchema>

export const AI_ARTIFACT_VERSION = 1

const CountSchema = z.number().int().nonnegative()
const RecordIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/, 'id sem espaço, de 8 a 200')
const LabelSchema = z.string().trim().min(1).max(200)

/**
 * One call to a model. Strict on purpose: the record carries ids and counts only, so any extra
 * field (a login, a question, a prompt) is rejected instead of being stored.
 */
export const AiUsageRecordSchema = z.strictObject({
  id: RecordIdSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  origin: AiOriginSchema,
  model: LabelSchema,
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  costUsd: z.number().nonnegative().nullable().default(null),
  pricingVersion: LabelSchema.nullable().default(null),
  team: LabelSchema.nullable().default(null),
  skill: LabelSchema.nullable().default(null),
  repository: RepositorySchema.nullable().default(null),
  pullRequest: z.number().int().positive().nullable().default(null),
  runId: RecordIdSchema.nullable().default(null),
})
export type AiUsageRecord = z.infer<typeof AiUsageRecordSchema>
export type AiUsageRecordInput = z.input<typeof AiUsageRecordSchema>

export const EvalCaseOutcomeSchema = z.strictObject({
  id: LabelSchema,
  passed: z.boolean(),
  latencyMs: CountSchema.nullable(),
  inputTokens: CountSchema.nullable(),
  outputTokens: CountSchema.nullable(),
})
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcomeSchema>

/** Result of one golden set run, as written by the bot and chat runners. */
export const EvalRunSchema = z
  .strictObject({
    id: RecordIdSchema,
    suite: EvalSuiteSchema,
    runAt: z.iso.datetime({ offset: true }),
    commit: z.string().regex(/^([0-9a-f]{7,40}|desconhecido)$/, 'SHA do commit ou desconhecido'),
    model: LabelSchema,
    promptVersion: LabelSchema,
    offline: z.boolean(),
    total: CountSchema,
    passed: CountSchema,
    inputTokens: CountSchema.nullable(),
    outputTokens: CountSchema.nullable(),
    latencyMs: z.strictObject({ p50: CountSchema, max: CountSchema }).nullable(),
    cases: z.array(EvalCaseOutcomeSchema),
  })
  .refine((run) => run.passed <= run.total, 'passed não pode passar de total')
export type EvalRun = z.infer<typeof EvalRunSchema>

export const EvalRunArtifactSchema = z.strictObject({
  schemaVersion: z.literal(AI_ARTIFACT_VERSION),
  kind: z.literal('eval-run'),
  run: EvalRunSchema,
})

export const AiUsageArtifactSchema = z.strictObject({
  schemaVersion: z.literal(AI_ARTIFACT_VERSION),
  kind: z.literal('ai-usage'),
  records: z.array(AiUsageRecordSchema),
})

/** JSON files the runners write and the worker collects from CI artifacts or fixtures. */
export const AiArtifactSchema = z.discriminatedUnion('kind', [
  EvalRunArtifactSchema,
  AiUsageArtifactSchema,
])
export type AiArtifact = z.infer<typeof AiArtifactSchema>

export const PrecisionPointSchema = z.object({
  runId: z.string(),
  runAt: z.iso.datetime({ offset: true }),
  rate: z.number().min(0).max(1),
  passed: CountSchema,
  total: CountSchema,
  model: z.string(),
  promptVersion: z.string(),
  commit: z.string(),
})
export type PrecisionPoint = z.infer<typeof PrecisionPointSchema>

export const PrecisionSeriesSchema = z.object({
  suite: EvalSuiteSchema,
  threshold: z.number().min(0).max(1),
  points: z.array(PrecisionPointSchema),
  latest: PrecisionPointSchema.nullable(),
})
export type PrecisionSeries = z.infer<typeof PrecisionSeriesSchema>

export const PrecisionAlertSchema = z.object({
  suite: EvalSuiteSchema,
  rate: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  runId: z.string(),
  runAt: z.iso.datetime({ offset: true }),
})
export type PrecisionAlert = z.infer<typeof PrecisionAlertSchema>

export const CostBucketSchema = z.object({
  key: z.string(),
  calls: CountSchema,
  inputTokens: CountSchema,
  outputTokens: CountSchema,
  costUsd: z.number().nonnegative(),
  unpricedCalls: CountSchema,
})
export type CostBucket = z.infer<typeof CostBucketSchema>

export const PullRequestCostSchema = CostBucketSchema.extend({
  repository: z.string(),
  pullRequest: z.number().int().positive(),
})
export type PullRequestCost = z.infer<typeof PullRequestCostSchema>

export const CostDaySchema = z.object({
  day: z.iso.date(),
  byOrigin: z.record(AiOriginSchema, z.number().nonnegative()),
})
export type CostDay = z.infer<typeof CostDaySchema>

/** Spend of the gateway virtual key, as read through the LiteLLM port. */
export const GatewaySpendSchema = z.object({
  source: z.enum(['fake', 'litellm']),
  keyAlias: z.string(),
  spendUsd: z.number().nonnegative(),
  maxBudgetUsd: z.number().nonnegative().nullable(),
  budgetResetAt: z.iso.datetime({ offset: true }).nullable(),
  readAt: z.iso.datetime({ offset: true }),
})
export type GatewaySpend = z.infer<typeof GatewaySpendSchema>

export const AiQualityResponseSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  days: z.number().int().positive(),
  pricingVersion: z.string(),
  precision: z.array(PrecisionSeriesSchema),
  alerts: z.array(PrecisionAlertSchema),
  cost: z.object({
    total: CostBucketSchema,
    byOrigin: z.array(CostBucketSchema),
    byTeam: z.array(CostBucketSchema),
    byPullRequest: z.array(PullRequestCostSchema),
    byDay: z.array(CostDaySchema),
  }),
  gateway: GatewaySpendSchema.nullable(),
})
export type AiQualityResponse = z.infer<typeof AiQualityResponseSchema>

export const AiQualityQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).optional(),
})
export type AiQualityQuery = z.infer<typeof AiQualityQuerySchema>
