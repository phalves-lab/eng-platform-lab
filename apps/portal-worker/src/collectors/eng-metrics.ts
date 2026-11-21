import type { MetricSnapshotRepository } from '@lab/database'
import type { PanelData } from '@lab/eng-metrics/contract'
import type { Collector } from '../collector.js'

export interface EngMetricsCollectorOptions {
  snapshots: Pick<MetricSnapshotRepository, 'save'>
  collect: (now: string) => Promise<PanelData>
  intervalMs: number
  timeZone: string
}

/** Calendar day of `date` in `timeZone`, as YYYY-MM-DD. */
export const dayIn = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

/** Computes the panel datasets with the eng-metrics logic and stores each one as today's snapshot. */
export const createEngMetricsCollector = (options: EngMetricsCollectorOptions): Collector => ({
  name: 'eng-metrics',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const collectedAt = now.toISOString()
    const day = dayIn(now, options.timeZone)
    const data = await options.collect(collectedAt)
    for (const dataset of data.datasets) {
      await options.snapshots.save({ day, payload: dataset, collectedAt })
      logger.info('snapshot.saved', {
        dataset: dataset.id,
        day,
        queue: dataset.queue.length,
        alerts: dataset.alerts.length,
      })
    }
  },
})
