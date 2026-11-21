import { meter } from '@lab/telemetry'
import type { RunResult } from './scheduler.js'

export interface CollectorMetrics {
  record: (result: RunResult) => void
}

/** Run counter and duration histogram per collector and status, on the global meter. */
export const createCollectorMetrics = (): CollectorMetrics => {
  const workerMeter = meter('portal-worker')
  const runs = workerMeter.createCounter('portal_worker.collector.runs', {
    description: 'Collector runs by collector and status',
  })
  const duration = workerMeter.createHistogram('portal_worker.collector.duration', {
    description: 'Collector run duration',
    unit: 'ms',
  })
  return {
    record: ({ collector, status, durationMs }) => {
      const attributes = { collector, status }
      runs.add(1, attributes)
      if (status !== 'skipped') duration.record(durationMs, attributes)
    },
  }
}
