import { z } from 'zod'

const emptyAsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OTEL_ENABLED: z.preprocess(emptyAsUnset, z.enum(['true', 'false']).default('false')),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
      emptyAsUnset,
      z
        .url({ protocol: /^https?$/ })
        .transform((url) => (url.endsWith('/') ? url.slice(0, -1) : url))
        .optional(),
    ),
    OTEL_SERVICE_NAME: z.preprocess(
      emptyAsUnset,
      z
        .string()
        .regex(/^[\w.-]{1,64}$/, 'OTEL_SERVICE_NAME takes letters, digits, dot, dash or underscore')
        .optional(),
    ),
    OTEL_METRIC_EXPORT_INTERVAL: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  })
  .superRefine((env, ctx) => {
    if (env.OTEL_ENABLED === 'true' && !env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: 'custom',
        message: 'OTEL_ENABLED=true requires OTEL_EXPORTER_OTLP_ENDPOINT',
      })
    }
  })

export type TelemetryConfig =
  | { enabled: false }
  | {
      enabled: true
      endpoint: string
      serviceName: string
      environment: string
      metricIntervalMs: number
    }

/**
 * Reads the OpenTelemetry settings. Export stays off unless `OTEL_ENABLED=true`, and then it
 * needs an OTLP/HTTP endpoint; extra exporter headers come from `OTEL_EXPORTER_OTLP_HEADERS`.
 */
export const loadTelemetryConfig = (
  env: NodeJS.ProcessEnv,
  defaultServiceName: string,
): TelemetryConfig => {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid telemetry configuration: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  const value = parsed.data
  if (value.OTEL_ENABLED !== 'true' || !value.OTEL_EXPORTER_OTLP_ENDPOINT) return { enabled: false }
  return {
    enabled: true,
    endpoint: value.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: value.OTEL_SERVICE_NAME ?? defaultServiceName,
    environment: value.NODE_ENV,
    metricIntervalMs: value.OTEL_METRIC_EXPORT_INTERVAL,
  }
}
