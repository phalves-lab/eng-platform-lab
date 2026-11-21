import { register } from 'node:module'
import { context, metrics, propagation, trace } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics'
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node'
import type { TelemetryConfig } from './config.js'
import { RedactingSpanExporter } from './redact.js'

export interface Telemetry {
  enabled: boolean
  shutdown: () => Promise<void>
}

export interface TelemetryOptions {
  version?: string
  spanExporter?: SpanExporter
  metricExporter?: PushMetricExporter
  instrumentations?: Instrumentation[]
  registerEsmHook?: boolean
}

const disabled: Telemetry = { enabled: false, shutdown: () => Promise.resolve() }
let active: Telemetry = disabled

const isHealthProbe = (url: string | undefined) => url === '/health' || url === '/health/ready'

const defaultInstrumentations = (): Instrumentation[] => [
  new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) => isHealthProbe(request.url),
  }),
  new PgInstrumentation({ enhancedDatabaseReporting: false }),
  new UndiciInstrumentation(),
]

/**
 * Starts tracing and metrics with OTLP/HTTP export when the configuration enables it; with it
 * off nothing is registered and the global API stays a no-op. HTTP, `pg` and `fetch` (undici)
 * are instrumented. Must run before the application modules load, so it is meant for a
 * `node --import` entry, which also registers the ESM loader hook the `pg` patch needs.
 */
export const startTelemetry = (config: TelemetryConfig, options: TelemetryOptions = {}) => {
  if (!config.enabled) return disabled
  if (options.registerEsmHook ?? true) {
    register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
  }
  const resource = resourceFromAttributes({
    'service.name': config.serviceName,
    'service.version': options.version ?? 'dev',
    'deployment.environment.name': config.environment,
  })
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new RedactingSpanExporter(
          options.spanExporter ?? new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` }),
        ),
      ),
    ],
  })
  tracerProvider.register()
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter:
          options.metricExporter ??
          new OTLPMetricExporter({ url: `${config.endpoint}/v1/metrics` }),
        exportIntervalMillis: config.metricIntervalMs,
      }),
    ],
  })
  metrics.setGlobalMeterProvider(meterProvider)
  const unregister = registerInstrumentations({
    instrumentations: options.instrumentations ?? defaultInstrumentations(),
    tracerProvider,
    meterProvider,
  })
  active = {
    enabled: true,
    shutdown: async () => {
      unregister()
      await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()])
      metrics.disable()
      trace.disable()
      propagation.disable()
      context.disable()
    },
  }
  return active
}

/** Flushes and stops the running telemetry, if any; safe to call more than once. */
export const shutdownTelemetry = async () => {
  const current = active
  active = disabled
  await current.shutdown()
}
