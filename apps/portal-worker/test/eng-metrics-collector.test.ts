import type { SnapshotPayload } from '@lab/database'
import type { PanelDataset } from '@lab/eng-metrics/contract'
import { collectPanelData } from '@lab/eng-metrics/collect'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createEngMetricsCollector, dayIn } from '../src/collectors/eng-metrics.js'
import { createLogger } from '../src/logger.js'

describe('eng-metrics collector', () => {
  it('stores the snapshot schema exactly as the collector computes it', () => {
    expectTypeOf<PanelDataset>().toEqualTypeOf<SnapshotPayload>()
  })

  it('uses the calendar day of the configured time zone', () => {
    const lateEvening = new Date('2026-11-21T01:30:00.000Z')
    expect(dayIn(lateEvening, 'America/Sao_Paulo')).toBe('2026-11-20')
    expect(dayIn(lateEvening, 'UTC')).toBe('2026-11-21')
  })

  it('saves one snapshot per computed dataset for the day', async () => {
    const save = vi.fn((input: { day: string; payload: SnapshotPayload; collectedAt: string }) =>
      Promise.resolve({ dataset: input.payload.id, ...input }),
    )
    const lines: string[] = []
    const collector = createEngMetricsCollector({
      snapshots: { save },
      collect: (now) => collectPanelData({ lab: null, demo: true }, now),
      intervalMs: 60_000,
      timeZone: 'America/Sao_Paulo',
    })
    await collector.run({
      now: new Date('2026-11-20T12:00:00.000Z'),
      logger: createLogger((line) => lines.push(line)),
    })

    expect(collector).toMatchObject({ name: 'eng-metrics', schedule: { intervalMs: 60_000 } })
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ day: '2026-11-20', collectedAt: '2026-11-20T12:00:00.000Z' }),
    )
    expect(save.mock.calls[0]?.[0].payload.id).toBe('demo')
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      msg: 'snapshot.saved',
      dataset: 'demo',
      day: '2026-11-20',
    })
  })
})
