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
