import { z } from 'zod'

export const StandardStatusSchema = z.enum([
  'VIGENTE',
  'CONFLITO',
  'PROPOSTO',
  'LACUNA',
  'DESCONHECIDO',
])
export type StandardStatus = z.infer<typeof StandardStatusSchema>

export const StandardSummarySchema = z.object({
  id: z.string(),
  area: z.string(),
  title: z.string(),
  status: StandardStatusSchema,
})
export type StandardSummary = z.infer<typeof StandardSummarySchema>

export const StandardSchema = StandardSummarySchema.extend({
  fields: z.record(z.string(), z.string()),
  text: z.string(),
  source: z.string(),
})
export type Standard = z.infer<typeof StandardSchema>

export const SystemSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  layer: z.string(),
  status: z.string(),
  summary: z.string(),
})
export type SystemSummary = z.infer<typeof SystemSummarySchema>

export const SystemSchema = SystemSummarySchema.extend({
  fields: z.record(z.string(), z.string()),
  source: z.string(),
})
export type System = z.infer<typeof SystemSchema>

export const GlossaryEntrySchema = z.object({
  term: z.string(),
  definition: z.string(),
  source: z.string(),
})
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>

export const DecisionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  kind: z.string(),
  question: z.string(),
  priority: z.number().int(),
  source: z.string(),
})
export type Decision = z.infer<typeof DecisionSchema>

export const SearchHitSchema = z.object({
  source: z.string(),
  snippet: z.string(),
  score: z.number(),
})
export type SearchHit = z.infer<typeof SearchHitSchema>

export const AskRequestSchema = z.object({ question: z.string().trim().min(3).max(500) })
export type AskRequest = z.infer<typeof AskRequestSchema>

export const AskResponseSchema = z.object({
  mode: z.literal('retrieval'),
  answer: z.string(),
  sources: z.array(SearchHitSchema),
})
export type AskResponse = z.infer<typeof AskResponseSchema>

export const UserSchema = z.object({
  login: z.string(),
  name: z.string(),
  role: z.enum(['dev', 'lead', 'admin']),
})
export type User = z.infer<typeof UserSchema>

export const HandbookOverviewSchema = z.object({
  standards: z.record(StandardStatusSchema, z.number().int()),
  systems: z.number().int(),
  glossary: z.number().int(),
  decisions: z.number().int(),
})
export type HandbookOverview = z.infer<typeof HandbookOverviewSchema>

/** Query filters accepted by the standards listing. */
export const StandardFilterSchema = z.object({
  term: z.string().trim().min(1).optional(),
  area: z.string().trim().min(1).optional(),
  status: StandardStatusSchema.optional(),
})
export type StandardFilter = z.infer<typeof StandardFilterSchema>

export const DatasetIdSchema = z.enum(['lab', 'demo'])
export type DatasetId = z.infer<typeof DatasetIdSchema>

export const ReviewMetricsQuerySchema = z.object({ dataset: DatasetIdSchema.default('lab') })
export type ReviewMetricsQuery = z.infer<typeof ReviewMetricsQuerySchema>

export const BotSignalCountsSchema = z.object({
  pronto: z.number().int().nonnegative(),
  gate: z.number().int().nonnegative(),
  ajustes: z.number().int().nonnegative(),
  sem_comentario: z.number().int().nonnegative(),
})
export type BotSignalCounts = z.infer<typeof BotSignalCountsSchema>

export const ReviewerLoadSchema = z.object({
  reviewer: z.string(),
  reviews: z.number().int().nonnegative(),
  pullRequests: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
})
export type ReviewerLoad = z.infer<typeof ReviewerLoadSchema>

export const ReviewPairSchema = z.object({
  author: z.string(),
  reviewer: z.string(),
  count: z.number().int().positive(),
})
export type ReviewPair = z.infer<typeof ReviewPairSchema>

/** Team review metrics over the collector window; medians are null when no PR qualifies. */
export const ReviewMetricsSchema = z.object({
  windowDays: z.number().int().positive(),
  merged: z.number().int().nonnegative(),
  medianHoursToFirstReview: z.number().nonnegative().nullable(),
  medianBusinessDaysToMerge: z.number().nonnegative().nullable(),
  medianSize: z.number().nonnegative().nullable(),
  mergedWithFailingChecks: z.number().int().nonnegative(),
  signals: BotSignalCountsSchema,
  reviewers: z.array(ReviewerLoadSchema),
  pairs: z.array(ReviewPairSchema),
})
export type ReviewMetrics = z.infer<typeof ReviewMetricsSchema>

export const ReviewTrendPointSchema = z.object({
  weekStart: z.iso.datetime(),
  merged: z.number().int().nonnegative(),
  medianHoursToFirstReview: z.number().nonnegative().nullable(),
  medianSize: z.number().nonnegative().nullable(),
})
export type ReviewTrendPoint = z.infer<typeof ReviewTrendPointSchema>

export const DeliveryAlertSchema = z.object({
  kind: z.string(),
  severity: z.enum(['alta', 'media']),
  subject: z.string(),
  message: z.string(),
  url: z.string().nullable(),
})
export type DeliveryAlert = z.infer<typeof DeliveryAlertSchema>

export const ReviewMetricsResponseSchema = z.object({
  dataset: DatasetIdSchema,
  title: z.string(),
  generatedAt: z.iso.datetime(),
  metrics: ReviewMetricsSchema,
  trend: z.array(ReviewTrendPointSchema),
  alerts: z.array(DeliveryAlertSchema),
})
export type ReviewMetricsResponse = z.infer<typeof ReviewMetricsResponseSchema>
