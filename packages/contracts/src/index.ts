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

export const CitationKindSchema = z.enum(['standard', 'system', 'term', 'passage'])

/** A handbook item the answer relies on: standard ID, system slug, glossary term or section. */
export const CitationSchema = z.object({
  kind: CitationKindSchema,
  ref: z.string(),
  label: z.string(),
  source: z.string(),
})
export type Citation = z.infer<typeof CitationSchema>

export const RetrievalAskResponseSchema = z.object({
  mode: z.literal('retrieval'),
  answer: z.string(),
  sources: z.array(SearchHitSchema),
})
export type RetrievalAskResponse = z.infer<typeof RetrievalAskResponseSchema>

export const LlmAskResponseSchema = z.object({
  mode: z.literal('llm'),
  answer: z.string(),
  citations: z.array(CitationSchema),
})
export type LlmAskResponse = z.infer<typeof LlmAskResponseSchema>

export const AskResponseSchema = z.discriminatedUnion('mode', [
  RetrievalAskResponseSchema,
  LlmAskResponseSchema,
])
export type AskResponse = z.infer<typeof AskResponseSchema>
export type AskMode = AskResponse['mode']

/** Server-sent events of a streamed answer, in order: start, tool and delta events, then done or error. */
export const AskStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), mode: z.enum(['retrieval', 'llm']) }),
  z.object({ type: z.literal('tool'), name: z.string() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), response: AskResponseSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type AskStreamEvent = z.infer<typeof AskStreamEventSchema>

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

export const PluginMaturitySchema = z.enum(['draft', 'pilot', 'approved'])
export type PluginMaturity = z.infer<typeof PluginMaturitySchema>

export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
})
export type Skill = z.infer<typeof SkillSchema>

export const PluginSummarySchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: z.string().nullable(),
  author: z.string().nullable(),
  keywords: z.array(z.string()),
  maturity: PluginMaturitySchema,
  owner: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  skillCount: z.number().int(),
})
export type PluginSummary = z.infer<typeof PluginSummarySchema>

export const PluginInstallSchema = z.object({
  marketplace: z.string(),
  commands: z.array(z.string()),
})
export type PluginInstall = z.infer<typeof PluginInstallSchema>

export const PluginSchema = PluginSummarySchema.extend({
  skills: z.array(SkillSchema),
  install: PluginInstallSchema,
})
export type Plugin = z.infer<typeof PluginSchema>

/** Query filters accepted by the plugin listing. */
export const PluginFilterSchema = z.object({
  term: z.string().trim().min(1).optional(),
  maturity: PluginMaturitySchema.optional(),
})
export type PluginFilter = z.infer<typeof PluginFilterSchema>

export const McpScopeSchema = z.enum(['read', 'write'])
export type McpScope = z.infer<typeof McpScopeSchema>

export const McpClientSchema = z.enum(['claude-code', 'kiro', 'cursor'])
export type McpClient = z.infer<typeof McpClientSchema>

export const McpInstallSchema = z.object({
  client: McpClientSchema,
  language: z.enum(['bash', 'json']),
  file: z.string().nullable(),
  snippet: z.string(),
})
export type McpInstall = z.infer<typeof McpInstallSchema>

export const McpServerSchema = z.object({
  name: z.string(),
  description: z.string(),
  scope: McpScopeSchema,
  accesses: z.array(z.string()),
  cautions: z.array(z.string()),
  owner: z.string(),
  reviewedAt: z.string(),
  install: z.array(McpInstallSchema),
})
export type McpServer = z.infer<typeof McpServerSchema>

export * from './releases.js'
export * from './conversations.js'
export * from './release-write.js'
export * from './dora.js'
export * from './flow.js'
export * from './scorecard.js'
export * from './docs.js'

/** Serializes one server-sent event carrying a JSON payload. */
export const encodeSseEvent = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`

/**
 * Incremental `text/event-stream` reader: feed it decoded chunks as they arrive and it returns
 * the `data` payload of every event completed so far. Partial events wait for the next chunk.
 */
export const createSseParser = () => {
  let buffer = ''
  return (chunk: string): string[] => {
    buffer = (buffer + chunk).replace(/\r\n/g, '\n')
    const payloads: string[] = []
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const data = buffer
        .slice(0, boundary)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) payloads.push(data)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
    }
    return payloads
  }
}
export * from './ai-quality.js'
