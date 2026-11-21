import { shutdownTelemetry } from '@lab/telemetry'
import { startTestTelemetry } from '@lab/telemetry/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { createCollectorMetrics } from '../src/metrics.js'

describe('createCollectorMetrics', () => {
  afterEach(() => shutdownTelemetry())

  it('counts runs by status and records the duration of the ones that ran', async () => {
    const telemetry = startTestTelemetry()
    const metrics = createCollectorMetrics()
    metrics.record({ collector: 'jira', status: 'ok', durationMs: 120 })
    metrics.record({ collector: 'jira', status: 'skipped', durationMs: 0 })
    metrics.record({ collector: 'dora', status: 'failed', durationMs: 30 })
    await shutdownTelemetry()

    const all = telemetry.metrics()
    const runs = all.find((metric) => metric.descriptor.name === 'portal_worker.collector.runs')
    const duration = all.find(
      (metric) => metric.descriptor.name === 'portal_worker.collector.duration',
    )
    expect(runs?.dataPoints.map((point) => [point.attributes, point.value]).sort()).toEqual(
      [
        [{ collector: 'jira', status: 'ok' }, 1],
        [{ collector: 'jira', status: 'skipped' }, 1],
        [{ collector: 'dora', status: 'failed' }, 1],
      ].sort(),
    )
    expect(duration?.dataPoints).toHaveLength(2)
    expect(duration?.descriptor.unit).toBe('ms')
  })
})
