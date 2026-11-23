import 'server-only'
import {
  ReleaseBranchesSchema,
  type ReleaseExecuteRequest,
  ReleaseExecuteResponseSchema,
  type ReleasePlanRequest,
  ReleasePlanSchema,
  ReleasePreviewSchema,
  ReleaseProjectSchema,
  type ReleasePublishExecute,
  ReleasePublishPlanSchema,
  type ReleasePublishRequest,
  ReleaseRunSchema,
  type ReleaseSide,
  type ReleaseSideFilter,
  ReleaseTrackingSchema,
} from '@lab/contracts'
import { z, type ZodType } from 'zod'
import { ApiError } from '@/lib/api'
import { portalFetch } from '@/lib/portal-fetch'

const ErrorBodySchema = z.object({ message: z.union([z.string(), z.array(z.string())]) })

/**
 * Server-side client for the release routes. It keeps the API error message, because the page
 * shows it as is (a missing GitHub token, a branch that does not exist).
 */
const send = async <T>(path: string, schema: ZodType<T>, payload?: unknown): Promise<T> => {
  const response = await portalFetch(
    path,
    payload === undefined
      ? { headers: { Accept: 'application/json' } }
      : {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        },
  )
  if (!response.ok) {
    const body = ErrorBodySchema.safeParse(await response.json().catch(() => null))
    const message = body.success
      ? [body.data.message].flat().join(' ')
      : `portal-api ${response.status} on ${path}`
    throw new ApiError(response.status, message)
  }
  return schema.parse(await response.json())
}

const get = <T>(path: string, schema: ZodType<T>) => send(path, schema)
const post = <T>(path: string, schema: ZodType<T>, body: unknown) => send(path, schema, body)
const project = (id: string) => `project=${encodeURIComponent(id)}`

export const releasesApi = {
  projects: () => get('/api/releases/projects', z.array(ReleaseProjectSchema)),
  branches: (project: string, side: ReleaseSide) =>
    get(
      `/api/releases/projects/${encodeURIComponent(project)}/branches?side=${side}`,
      ReleaseBranchesSchema,
    ),
  preview: (query: { project: string; side: ReleaseSideFilter; source: string; target: string }) =>
    get(`/api/releases/preview?${new URLSearchParams(query).toString()}`, ReleasePreviewSchema),
  plan: (body: ReleasePlanRequest) => post('/api/releases/plan', ReleasePlanSchema, body),
  execute: (body: ReleaseExecuteRequest) =>
    post('/api/releases/execute', ReleaseExecuteResponseSchema, body),
  publishPlan: (body: ReleasePublishRequest) =>
    post('/api/releases/publish/plan', ReleasePublishPlanSchema, body),
  publishExecute: (body: ReleasePublishExecute) =>
    post('/api/releases/publish/execute', ReleaseExecuteResponseSchema, body),
  tracking: (id: string) => get(`/api/releases/tracking?${project(id)}`, ReleaseTrackingSchema),
  history: (id: string) => get(`/api/releases/history?${project(id)}`, z.array(ReleaseRunSchema)),
}
