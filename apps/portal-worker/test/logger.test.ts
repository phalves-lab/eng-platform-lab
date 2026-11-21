import { describe, expect, it } from 'vitest'
import { createLogger } from '../src/logger.js'

describe('createLogger', () => {
  it('writes one JSON object per line with inherited context and serialized errors', () => {
    const lines: string[] = []
    const logger = createLogger(
      (line) => lines.push(line),
      { service: 'portal-worker' },
      () => new Date('2026-11-20T12:00:00.000Z'),
    )
    logger.child({ collector: 'eng-metrics' }).error('collector.failed', {
      error: new TypeError('boom'),
      durationMs: 5,
    })
    logger.warn('w')
    logger.info('i', { n: 1 })

    expect(lines.every((line) => line.endsWith('\n'))).toBe(true)
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        time: '2026-11-20T12:00:00.000Z',
        level: 'error',
        msg: 'collector.failed',
        service: 'portal-worker',
        collector: 'eng-metrics',
        error: { name: 'TypeError', message: 'boom' },
        durationMs: 5,
      },
      { time: '2026-11-20T12:00:00.000Z', level: 'warn', msg: 'w', service: 'portal-worker' },
      { time: '2026-11-20T12:00:00.000Z', level: 'info', msg: 'i', service: 'portal-worker', n: 1 },
    ])
  })
})
