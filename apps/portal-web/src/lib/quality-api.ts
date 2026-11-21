import 'server-only'
import {
  DocsReportSchema,
  RepoScorecardViewSchema,
  type ScorecardFilter,
  ScorecardResponseSchema,
} from '@lab/contracts'
import type { ZodType } from 'zod'
import { ApiError } from '@/lib/api'

const baseUrl = () => process.env.PORTAL_API_URL ?? 'http://localhost:4100'

const get = async <T>(path: string, schema: ZodType<T>): Promise<T> => {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
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

/** Server-side client for the quality routes; the browser never calls the API directly. */
export const qualityApi = {
  scorecard: (filter: ScorecardFilter) =>
    get(`/api/quality/scorecard${query(filter)}`, ScorecardResponseSchema),
  scorecardRepo: (id: string) =>
    get(`/api/quality/scorecard/${encodeURIComponent(id)}`, RepoScorecardViewSchema),
  docs: (months?: number) => get(`/api/quality/docs${query({ months })}`, DocsReportSchema),
}
