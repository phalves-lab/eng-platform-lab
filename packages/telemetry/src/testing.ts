import {
  AggregationTemporality,
  InMemoryMetricExporter,
  type MetricData,
} from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-node'
import { startTelemetry } from './sdk.js'

class KeptSpanExporter extends InMemorySpanExporter {
  override shutdown() {
    return Promise.resolve()
  }
}

/**
 * Starts telemetry with in-memory exporters for tests. Spans and metrics are complete only
 * after `shutdownTelemetry()`, which flushes both.
 */
export const startTestTelemetry = (version?: string) => {
  const spanExporter = new KeptSpanExporter()
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  startTelemetry(
    {
      enabled: true,
      endpoint: 'http://127.0.0.1:9',
      serviceName: 'portal-test',
      environment: 'test',
      metricIntervalMs: 60_000,
    },
    {
      spanExporter,
      metricExporter,
      instrumentations: [],
      registerEsmHook: false,
      ...(version ? { version } : {}),
    },
  )
  return {
    spans: (): ReadableSpan[] => spanExporter.getFinishedSpans(),
    metrics: (): MetricData[] =>
      metricExporter
        .getMetrics()
        .flatMap((batch) => batch.scopeMetrics.flatMap((scope) => scope.metrics)),
  }
}
