import { describe, expect, it } from 'vitest'
import { createDatabaseProbe, probePool } from '../src/health/database-probe.js'
import { ReadinessService } from '../src/health/readiness.service.js'
import { NestJsonLogger, createPortalLogger } from '../src/observability/logger.js'
import { requestContext, requestIdFrom } from '../src/observability/request-context.js'

const capture = () => {
  const lines: string[] = []
  const logger = createPortalLogger(
    (line) => lines.push(line),
    () => ({ ...requestContext.getStore() }),
  )
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>)
  return { logger, entries }
}

describe('probePool', () => {
  it('is ok when SELECT 1 answers', async () => {
    const probe = probePool(
      { query: () => Promise.resolve({ rows: [] }), end: () => Promise.resolve() } as never,
      () => undefined,
    )
    expect(await probe.check()).toEqual({ status: 'ok' })
  })

  it('fails with a fixed detail on errors and timeouts', async () => {
    const errors: unknown[] = []
    const failing = probePool(
      {
        query: () => Promise.reject(new Error('password authentication failed for user lab')),
        end: () => Promise.resolve(),
      } as never,
      (error) => errors.push(error),
    )
    expect(await failing.check()).toEqual({ status: 'failed', detail: 'unreachable' })
    expect(errors).toHaveLength(1)

    const hanging = probePool(
      { query: () => new Promise(() => undefined), end: () => Promise.resolve() } as never,
      () => undefined,
      10,
    )
    expect(await hanging.check()).toEqual({ status: 'failed', detail: 'timeout' })
  })

  it('skips the check when the API reads the panel from a file', async () => {
    const probe = createDatabaseProbe({ kind: 'file', path: '/tmp/data.json' }, () => undefined)
    expect(await probe.check()).toEqual({ status: 'skipped', detail: 'not_configured' })
    await probe.close()
  })
})

describe('ReadinessService', () => {
  it('is not ready while the handbook is not loaded', async () => {
    const service = new ReadinessService(
      { llm: null },
      { isLoaded: () => false },
      { check: () => Promise.resolve({ status: 'ok' }), close: () => Promise.resolve() },
    )
    expect(await service.check()).toEqual({
      status: 'not_ready',
      checks: {
        database: { status: 'ok' },
        handbook: { status: 'failed', detail: 'not_loaded' },
        model: { status: 'ok', mode: 'retrieval' },
      },
    })
  })
})

describe('requestIdFrom', () => {
  it('keeps safe upstream ids and generates one otherwise', () => {
    expect(requestIdFrom('abc-123_x.y')).toBe('abc-123_x.y')
    expect(requestIdFrom('short')).toMatch(/^[\da-f-]{36}$/)
    expect(requestIdFrom(['edge-req-0001'])).toMatch(/^[\da-f-]{36}$/)
    expect(requestIdFrom('x'.repeat(129))).toMatch(/^[\da-f-]{36}$/)
  })
})

describe('portal logger', () => {
  it('adds the request id of the current request to every line', () => {
    const { logger, entries } = capture()
    requestContext.run({ requestId: 'edge-req-0001' }, () => logger.info('ask.answered'))
    logger.info('outside')
    expect(entries()).toMatchObject([
      { msg: 'ask.answered', requestId: 'edge-req-0001', service: 'portal-api' },
      { msg: 'outside', service: 'portal-api' },
    ])
    expect(entries()[1]).not.toHaveProperty('requestId')
  })
})

describe('NestJsonLogger', () => {
  it('maps Nest levels to JSON lines with context and stack, dropping debug and verbose', () => {
    const { logger, entries } = capture()
    const nest = new NestJsonLogger(logger)
    nest.log('Mapped {/health, GET} route', 'RouterExplorer')
    nest.warn({ reason: 'slow' })
    nest.error('Erro para ana@exemplo.com', 'Error: x\n    at y', 'ExceptionsHandler')
    nest.error(new TypeError('boom'))
    nest.debug()
    nest.verbose()

    expect(entries()).toMatchObject([
      { level: 'info', msg: 'Mapped {/health, GET} route', context: 'RouterExplorer' },
      { level: 'warn', msg: '{"reason":"slow"}' },
      {
        level: 'error',
        msg: 'Erro para [e-mail]',
        context: 'ExceptionsHandler',
        stack: 'Error: x\n    at y',
      },
      { level: 'error', msg: 'TypeError: boom' },
    ])
    expect(entries()).toHaveLength(4)
  })
})
