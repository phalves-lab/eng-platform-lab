import { withSpan } from '@lab/telemetry'
import type { Collector } from './collector.js'
import type { Logger } from './logger.js'
import { type CollectorMetrics, createCollectorMetrics } from './metrics.js'

export interface RunResult {
  collector: string
  status: 'ok' | 'failed' | 'skipped'
  durationMs: number
}

export interface SchedulerOptions {
  collectors: Collector[]
  logger: Logger
  clock?: () => Date
  metrics?: CollectorMetrics
}

/**
 * Runs each collector on its own interval. A tick that arrives while the previous run of the
 * same collector is still going is skipped, so slow sources never pile up concurrent runs.
 */
export class Scheduler {
  private readonly inFlight = new Map<string, Promise<RunResult>>()
  private readonly timers: NodeJS.Timeout[] = []
  private readonly clock: () => Date
  private readonly metrics: CollectorMetrics

  constructor(private readonly options: SchedulerOptions) {
    this.clock = options.clock ?? (() => new Date())
    this.metrics = options.metrics ?? createCollectorMetrics()
  }

  run(collector: Collector): Promise<RunResult> {
    const logger = this.options.logger.child({ collector: collector.name })
    if (this.inFlight.has(collector.name)) {
      logger.warn('collector.skipped', { reason: 'previous run still in progress' })
      const skipped: RunResult = { collector: collector.name, status: 'skipped', durationMs: 0 }
      this.metrics.record(skipped)
      return Promise.resolve(skipped)
    }
    const execution = this.execute(collector, logger).finally(() =>
      this.inFlight.delete(collector.name),
    )
    this.inFlight.set(collector.name, execution)
    return execution
  }

  runAll(): Promise<RunResult[]> {
    return Promise.all(this.options.collectors.map((collector) => this.run(collector)))
  }

  start(): void {
    for (const collector of this.options.collectors) {
      void this.run(collector)
      this.timers.push(setInterval(() => void this.run(collector), collector.schedule.intervalMs))
      this.options.logger.info('collector.scheduled', {
        collector: collector.name,
        intervalMs: collector.schedule.intervalMs,
      })
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.timers.splice(0)) clearInterval(timer)
    await Promise.all(this.inFlight.values())
  }

  private async execute(collector: Collector, logger: Logger): Promise<RunResult> {
    const result = await this.traced(collector, logger)
    this.metrics.record(result)
    return result
  }

  private traced(collector: Collector, logger: Logger): Promise<RunResult> {
    const startedAt = this.clock()
    const elapsed = () => this.clock().getTime() - startedAt.getTime()
    return withSpan('collector.run', { 'collector.name': collector.name }, async () => {
      logger.info('collector.started')
      try {
        await collector.run({ now: startedAt, logger })
        logger.info('collector.finished', { durationMs: elapsed() })
        return { collector: collector.name, status: 'ok', durationMs: elapsed() }
      } catch (error) {
        logger.error('collector.failed', { durationMs: elapsed(), error })
        return { collector: collector.name, status: 'failed', durationMs: elapsed() }
      }
    })
  }
}
