import {
  type Attributes,
  type Meter,
  SpanStatusCode,
  isSpanContextValid,
  metrics,
  trace,
} from '@opentelemetry/api'

export type TraceFields = {
  traceId?: string
  spanId?: string
}

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/
const ZEROS = /^0+$/

/** Trace and span ids of the active span, or nothing when no valid span is active. */
export const traceFields = (): TraceFields => {
  const context = trace.getActiveSpan()?.spanContext()
  if (!context || !isSpanContextValid(context)) return {}
  return { traceId: context.traceId, spanId: context.spanId }
}

/** Trace id carried by a W3C `traceparent` header, so logs correlate even with export off. */
export const traceIdFromHeader = (header: string | undefined): string | undefined => {
  const match = header ? TRACEPARENT.exec(header.trim().toLowerCase()) : null
  const traceId = match?.[1]
  return traceId && !ZEROS.test(traceId) ? traceId : undefined
}

/**
 * Runs `work` inside an active span. Failures mark the span as an error with the error name
 * only, since messages may carry data from external systems.
 */
export const withSpan = <T>(
  name: string,
  attributes: Attributes,
  work: () => Promise<T>,
  tracerName = '@lab/telemetry',
): Promise<T> =>
  trace.getTracer(tracerName).startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work()
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.name : 'Error',
      })
      throw error
    } finally {
      span.end()
    }
  })

/** Meter from the global provider; a no-op until telemetry starts. */
export const meter = (name: string): Meter => metrics.getMeter(name)
