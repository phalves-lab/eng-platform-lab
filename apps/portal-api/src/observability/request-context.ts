import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import { type Logger, traceFields, traceIdFromHeader } from '@lab/telemetry'
import type { Request, Response } from 'express'
import { PORTAL_LOGGER } from './logger.js'

export interface RequestContext {
  requestId: string
  traceId?: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export const REQUEST_ID_HEADER = 'x-request-id'

const REQUEST_ID = /^[\w.-]{8,128}$/

/** Keeps a well-formed upstream request id so the edge and the API log the same id. */
export const requestIdFrom = (header: unknown) =>
  typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID()

const headerValue = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined

const isHealthProbe = (path: string) => path === '/health' || path === '/health/ready'

const levelOf = (status: number) => {
  if (status >= 500) return 'error'
  return status >= 400 ? 'warn' : 'info'
}

/** Route template matched by Express, never the raw URL, so ids and queries stay out of logs. */
const routeOf = (request: Request): string | null => {
  const route: unknown = request.route
  if (route && typeof route === 'object' && 'path' in route && typeof route.path === 'string') {
    return `${request.baseUrl}${route.path}`
  }
  return null
}

/**
 * Gives every request an id (echoed in `x-request-id`) and the trace id, keeps both in async
 * context for the logs written while it runs, and writes one access line when it finishes.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(@Inject(PORTAL_LOGGER) private readonly logger: Logger) {}

  use(request: Request, response: Response, next: () => void) {
    const requestId = requestIdFrom(request.headers[REQUEST_ID_HEADER])
    const traceId =
      traceFields().traceId ?? traceIdFromHeader(headerValue(request.headers.traceparent))
    const context: RequestContext = traceId ? { requestId, traceId } : { requestId }
    const startedAt = performance.now()
    response.setHeader(REQUEST_ID_HEADER, requestId)
    response.once('finish', () => {
      const status = response.statusCode
      if (isHealthProbe(request.path) && status < 400) return
      this.logger[levelOf(status)]('http.request', {
        ...context,
        method: request.method,
        route: routeOf(request),
        status,
        durationMs: Math.round(performance.now() - startedAt),
      })
    })
    requestContext.run(context, next)
  }
}
