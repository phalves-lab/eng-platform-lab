import type { Logger } from './logger.js'

interface CollectorContext {
  now: Date
  logger: Logger
}

export interface Collector {
  name: string
  schedule: { intervalMs: number }
  run: (context: CollectorContext) => Promise<void>
}
