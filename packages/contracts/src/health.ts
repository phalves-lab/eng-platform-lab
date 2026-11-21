import { z } from 'zod'

export const HealthCheckStatusSchema = z.enum(['ok', 'failed', 'skipped'])
export type HealthCheckStatus = z.infer<typeof HealthCheckStatusSchema>

export const HealthCheckSchema = z.object({
  status: HealthCheckStatusSchema,
  detail: z.string().optional(),
})
export type HealthCheck = z.infer<typeof HealthCheckSchema>

/** Readiness of portal-api: ready only when no check failed; skipped checks do not block. */
export const ReadinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: HealthCheckSchema,
    handbook: HealthCheckSchema,
    model: HealthCheckSchema.extend({ mode: z.enum(['llm', 'retrieval']) }),
  }),
})
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>
