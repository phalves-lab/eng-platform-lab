import type { Collector } from './collector.js'
import type { Logger } from './logger.js'

export interface RunResult {
  collector: string
  status: 'ok' | 'failed' | 'skipped'
  durationMs: number
}

export interface SchedulerOptions {
  collectors: Collector[]
  logger: Logger
  clock?: () => Date
}

/**
 * Runs each collector on its own interval. A tick that arrives while the previous run of the
 * same collector is still going is skipped, so slow sources never pile up concurrent runs.
 */
export class Scheduler {
  private readonly inFlight = new Map<string, Promise<RunResult>>()
  private readonly timers: NodeJS.Timeout[] = []
  private readonly clock: () => Date

  constructor(private readonly options: SchedulerOptions) {
    this.clock = options.clock ?? (() => new Date())
  }

  run(collector: Collector): Promise<RunResult> {
    const logger = this.options.logger.child({ collector: collector.name })
    if (this.inFlight.has(collector.name)) {
      logger.warn('collector.skipped', { reason: 'previous run still in progress' })
      return Promise.resolve({ collector: collector.name, status: 'skipped', durationMs: 0 })
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
    const startedAt = this.clock()
    logger.info('collector.started')
    try {
      await collector.run({ now: startedAt, logger })
      const durationMs = this.clock().getTime() - startedAt.getTime()
      logger.info('collector.finished', { durationMs })
      return { collector: collector.name, status: 'ok', durationMs }
    } catch (error) {
      const durationMs = this.clock().getTime() - startedAt.getTime()
      logger.error('collector.failed', { durationMs, error })
      return { collector: collector.name, status: 'failed', durationMs }
    }
  }
}
