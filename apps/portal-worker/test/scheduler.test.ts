import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Collector } from '../src/collector.js'
import { createLogger } from '../src/logger.js'
import { Scheduler } from '../src/scheduler.js'

const capture = () => {
  const lines: Record<string, unknown>[] = []
  return { lines, logger: createLogger((line) => lines.push(JSON.parse(line))) }
}

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs on start and then on every interval', async () => {
    const { logger, lines } = capture()
    const run = vi.fn(() => Promise.resolve())
    const scheduler = new Scheduler({
      logger,
      collectors: [{ name: 'fast', schedule: { intervalMs: 1_000 }, run }],
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(3_000)
    await scheduler.stop()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(run).toHaveBeenCalledTimes(4)
    expect(lines.filter((l) => l.msg === 'collector.finished')).toHaveLength(4)
    expect(lines[0]).toMatchObject({ msg: 'collector.started', collector: 'fast' })
    expect(lines).toContainEqual(
      expect.objectContaining({ msg: 'collector.scheduled', intervalMs: 1_000 }),
    )
  })

  it('never overlaps two runs of the same collector', async () => {
    const { logger, lines } = capture()
    const gate = deferred()
    let active = 0
    let maxActive = 0
    const slow: Collector = {
      name: 'slow',
      schedule: { intervalMs: 1_000 },
      run: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await gate.promise
        active -= 1
      },
    }
    const scheduler = new Scheduler({ logger, collectors: [slow] })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(3_500)

    expect(maxActive).toBe(1)
    expect(lines.filter((l) => l.msg === 'collector.skipped')).toHaveLength(3)

    const stopping = scheduler.stop()
    gate.resolve()
    await stopping
    expect(lines.at(-1)).toMatchObject({ msg: 'collector.finished', collector: 'slow' })
    expect(await scheduler.run(slow)).toMatchObject({ status: 'ok' })
  })

  it('reports failures without stopping the other collectors', async () => {
    const { logger, lines } = capture()
    const scheduler = new Scheduler({
      logger,
      collectors: [
        {
          name: 'broken',
          schedule: { intervalMs: 1_000 },
          run: () => Promise.reject(new Error('x')),
        },
        { name: 'ok', schedule: { intervalMs: 1_000 }, run: () => Promise.resolve() },
      ],
    })
    const results = await scheduler.runAll()
    expect(results.map((r) => [r.collector, r.status])).toEqual([
      ['broken', 'failed'],
      ['ok', 'ok'],
    ])
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'collector.failed',
        collector: 'broken',
        error: { name: 'Error', message: 'x' },
      }),
    )
  })
})
