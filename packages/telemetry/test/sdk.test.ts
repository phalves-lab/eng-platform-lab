import { trace } from '@opentelemetry/api'
import { afterEach, describe, expect, it } from 'vitest'
import { createJsonLogger } from '../src/logger.js'
import { shutdownTelemetry, startTelemetry } from '../src/sdk.js'
import { startTestTelemetry as start } from '../src/testing.js'
import { meter, traceFields, traceIdFromHeader, withSpan } from '../src/trace.js'

afterEach(() => shutdownTelemetry())

describe('startTelemetry', () => {
  it('registers nothing when export is off', async () => {
    const telemetry = startTelemetry({ enabled: false })
    expect(telemetry.enabled).toBe(false)
    await withSpan('noop', {}, async () => {
      expect(traceFields()).toEqual({})
    })
    await telemetry.shutdown()
  })

  it('exports spans with the service resource and redacted attributes', async () => {
    const { spans } = start('1.2.3')

    const ids = await withSpan('collector.run', { 'url.full': 'https://x.invalid/a?q=1' }, () =>
      Promise.resolve(traceFields()),
    )
    await shutdownTelemetry()

    const [span] = spans()
    expect(span?.name).toBe('collector.run')
    expect(span?.attributes).toEqual({ 'url.full': 'https://x.invalid/a' })
    expect(span?.resource.attributes).toMatchObject({
      'service.name': 'portal-test',
      'service.version': '1.2.3',
      'deployment.environment.name': 'test',
    })
    expect(ids).toEqual({
      traceId: span?.spanContext().traceId,
      spanId: span?.spanContext().spanId,
    })
  })

  it('marks failed work as an error with the error name only and rethrows', async () => {
    const { spans } = start()
    await expect(
      withSpan('collector.run', {}, () => Promise.reject(new TypeError('ana@exemplo.com'))),
    ).rejects.toThrow(TypeError)
    await expect(withSpan('collector.run', {}, () => Promise.reject('boom'))).rejects.toBe('boom')
    await shutdownTelemetry()

    expect(spans().map((span) => span.status)).toEqual([
      { code: 2, message: 'TypeError' },
      { code: 2, message: 'Error' },
    ])
  })

  it('exports metrics recorded through the global meter on shutdown', async () => {
    const { metrics } = start()
    meter('portal-test').createCounter('portal_test.runs').add(2, { status: 'ok' })
    await shutdownTelemetry()

    const [metric] = metrics()
    expect(metric?.descriptor.name).toBe('portal_test.runs')
    expect(metric?.dataPoints[0]?.value).toBe(2)
  })

  it('stops only once and leaves the global tracer as a no-op', async () => {
    start()
    await shutdownTelemetry()
    await shutdownTelemetry()
    expect(trace.getActiveSpan()).toBeUndefined()
    await withSpan('after', {}, async () => expect(traceFields()).toEqual({}))
  })
})

describe('createJsonLogger', () => {
  it('adds the active trace ids and scrubs personal data', async () => {
    start()
    const lines: string[] = []
    const logger = createJsonLogger(
      (line) => lines.push(line),
      { service: 'portal-test' },
      () => new Date('2026-11-20T12:00:00.000Z'),
    )
    await withSpan('work', {}, async () => {
      logger.child({ collector: 'jira' }).warn('falhou para ana@exemplo.com', { cpf: '1' })
    })
    logger.info('fora do span')

    const [inside, outside] = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(inside).toMatchObject({
      level: 'warn',
      msg: 'falhou para [e-mail]',
      service: 'portal-test',
      collector: 'jira',
      cpf: '[removido]',
    })
    expect(inside?.['traceId']).toMatch(/^[\da-f]{32}$/)
    expect(inside?.['spanId']).toMatch(/^[\da-f]{16}$/)
    expect(outside).toEqual({
      time: '2026-11-20T12:00:00.000Z',
      level: 'info',
      msg: 'fora do span',
      service: 'portal-test',
    })
  })
})

describe('traceIdFromHeader', () => {
  it('reads the trace id of a valid traceparent header', () => {
    expect(traceIdFromHeader('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736',
    )
  })

  it('ignores missing, malformed and all-zero headers', () => {
    expect(traceIdFromHeader(undefined)).toBeUndefined()
    expect(traceIdFromHeader('garbage')).toBeUndefined()
    expect(
      traceIdFromHeader('00-00000000000000000000000000000000-00f067aa0ba902b7-01'),
    ).toBeUndefined()
  })
})
