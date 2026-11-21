import 'server-only'
import {
  ReleaseBranchesSchema,
  ReleasePreviewSchema,
  ReleaseProjectSchema,
  type ReleaseSide,
  type ReleaseSideFilter,
} from '@lab/contracts'
import { z, type ZodType } from 'zod'
import { ApiError } from '@/lib/api'

const ErrorBodySchema = z.object({ message: z.union([z.string(), z.array(z.string())]) })

const baseUrl = () => process.env.PORTAL_API_URL ?? 'http://localhost:4100'

/**
 * Server-side client for the release routes. It keeps the API error message, because the page
 * shows it as is (a missing GitHub token, a branch that does not exist).
 */
const get = async <T>(path: string, schema: ZodType<T>): Promise<T> => {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = ErrorBodySchema.safeParse(await response.json().catch(() => null))
    const message = body.success
      ? [body.data.message].flat().join(' ')
      : `portal-api ${response.status} on ${path}`
    throw new ApiError(response.status, message)
  }
  return schema.parse(await response.json())
}

export const releasesApi = {
  projects: () => get('/api/releases/projects', z.array(ReleaseProjectSchema)),
  branches: (project: string, side: ReleaseSide) =>
    get(
      `/api/releases/projects/${encodeURIComponent(project)}/branches?side=${side}`,
      ReleaseBranchesSchema,
    ),
  preview: (query: { project: string; side: ReleaseSideFilter; source: string; target: string }) =>
    get(`/api/releases/preview?${new URLSearchParams(query).toString()}`, ReleasePreviewSchema),
}
