import 'server-only'
import {
  AuditPageSchema,
  type AuditQuery,
  type DatasetId,
  type ModeChatRequest,
  BoardResponseSchema,
  ChatModesResponseSchema,
  BoardSummarySchema,
  DecisionSchema,
  DoraMetricsResponseSchema,
  FlowMetricsResponseSchema,
  GlossaryEntrySchema,
  HandbookOverviewSchema,
  ReviewMetricsResponseSchema,
  McpServerSchema,
  MyWorkResponseSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
  PluginSchema,
  PluginSummarySchema,
  SearchHitSchema,
  StandardSchema,
  StandardSummarySchema,
  SystemSchema,
  SystemRelationsSchema,
  SystemSummarySchema,
  TeamWorkResponseSchema,
  UserSchema,
} from '@lab/contracts'
import { z, type ZodType } from 'zod'
import { ApiError } from '@/lib/api-error'
import { portalFetch } from '@/lib/portal-fetch'

export { ApiError }

/**
 * Server-side client for portal-api. The browser never calls the API or any external service
 * directly; pages and route handlers go through this module.
 */
const request = async <T>(path: string, schema: ZodType<T>): Promise<T> => {
  const response = await portalFetch(path, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new ApiError(response.status, `portal-api ${response.status} on ${path}`)
  return schema.parse(await response.json())
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') search.set(key, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}

const QueueRowSchema = z.object({
  position: z.number(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  taskKey: z.string().nullable(),
  taskStatus: z.string().nullable(),
  requestedReviewers: z.array(z.string()),
  reviewedBy: z.array(z.string()),
  enteredAt: z.string(),
  ageBusinessDays: z.number(),
  level: z.enum(['ok', 'atencao', 'atrasado']),
  hasHumanReview: z.boolean(),
  checks: z.string().nullable(),
  botSignal: z.enum(['ajustes', 'gate', 'pronto']).nullable(),
  risks: z.array(z.string()),
  lines: z.number(),
})
export type QueueRow = z.infer<typeof QueueRowSchema>

const AlertSchema = z.object({
  kind: z.string(),
  severity: z.enum(['alta', 'media']),
  subject: z.string(),
  message: z.string(),
  url: z.string().nullable(),
})

const DatasetSchema = z.object({
  id: z.string(),
  title: z.string(),
  label: z.string(),
  generatedAt: z.string(),
  queue: z.array(QueueRowSchema),
  alerts: z.array(AlertSchema),
})
export type ReviewDataset = z.infer<typeof DatasetSchema>

const DatasetInfoSchema = DatasetSchema.pick({
  id: true,
  title: true,
  label: true,
  generatedAt: true,
})

export const api = {
  me: () => request('/api/me', UserSchema),
  overview: () => request('/api/handbook/overview', HandbookOverviewSchema),
  rules: () => request('/api/handbook/rules', z.object({ rules: z.string().nullable() })),
  standards: (filter: { term?: string; area?: string; status?: string }) =>
    request(`/api/handbook/standards${query(filter)}`, z.array(StandardSummarySchema)),
  standard: (id: string) =>
    request(`/api/handbook/standards/${encodeURIComponent(id)}`, StandardSchema),
  systems: (term?: string) =>
    request(`/api/handbook/systems${query({ term })}`, z.array(SystemSummarySchema)),
  system: (slug: string) =>
    request(`/api/handbook/systems/${encodeURIComponent(slug)}`, SystemSchema),
  systemRelations: (slug: string) =>
    request(`/api/handbook/systems/${encodeURIComponent(slug)}/relations`, SystemRelationsSchema),
  glossary: (term?: string) =>
    request(`/api/handbook/glossary${query({ term })}`, z.array(GlossaryEntrySchema)),
  decisions: (priority?: number) =>
    request(`/api/handbook/decisions${query({ priority })}`, z.array(DecisionSchema)),
  search: (q: string, limit = 6) =>
    request(`/api/handbook/search${query({ q, limit })}`, z.array(SearchHitSchema)),
  chatModes: async () => (await request('/api/ask/modes', ChatModesResponseSchema)).modes,
  askStream: async (body: ModeChatRequest, signal: AbortSignal) => {
    const response = await portalFetch('/api/ask/stream', {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok || !response.body) {
      throw new ApiError(response.status, `portal-api ${response.status} on /api/ask/stream`)
    }
    return response.body
  },
  datasets: () => request('/api/review/datasets', z.array(DatasetInfoSchema)),
  dataset: (id: string) => request(`/api/review/datasets/${encodeURIComponent(id)}`, DatasetSchema),
  myWork: (dataset?: string) => request(`/api/me/work${query({ dataset })}`, MyWorkResponseSchema),
  teamWork: (filter: { team?: string; dataset?: string }) =>
    request(`/api/team/work${query(filter)}`, TeamWorkResponseSchema),
  reviewMetrics: (dataset: DatasetId) =>
    request(`/api/metrics/review${query({ dataset })}`, ReviewMetricsResponseSchema),
  doraMetrics: (filter: { team?: string; repo?: string }) =>
    request(`/api/metrics/dora${query(filter)}`, DoraMetricsResponseSchema),
  flowMetrics: (filter: { project?: string; component?: string; weeks: number }) =>
    request(`/api/metrics/flow${query(filter)}`, FlowMetricsResponseSchema),
  boards: () => request('/api/boards', z.array(BoardSummarySchema)),
  board: (project: string) =>
    request(`/api/boards/${encodeURIComponent(project)}`, BoardResponseSchema),
  plugins: (filter: { term?: string; maturity?: string }) =>
    request(`/api/catalog/plugins${query(filter)}`, z.array(PluginSummarySchema)),
  plugin: (name: string) =>
    request(`/api/catalog/plugins/${encodeURIComponent(name)}`, PluginSchema),
  mcps: () => request('/api/catalog/mcps', z.array(McpServerSchema)),
  projects: (term?: string) =>
    request(`/api/projects${query({ term })}`, z.array(ProjectSummarySchema)),
  project: (id: string) => request(`/api/projects/${encodeURIComponent(id)}`, ProjectDetailSchema),
  audit: (filter: Partial<AuditQuery>) => request(`/api/audit${query(filter)}`, AuditPageSchema),
}
