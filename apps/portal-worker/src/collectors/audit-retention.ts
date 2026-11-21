import type { AuditEventRepository } from '@lab/database'
import type { Collector } from '../collector.js'

const DAY_MS = 86_400_000

export interface AuditRetentionOptions {
  events: Pick<AuditEventRepository, 'removeOlderThan'>
  retentionDays: number
  intervalMs: number
}

/** Deletes audit events older than `retentionDays` days; release runs keep their own history. */
export const createAuditRetentionCollector = (options: AuditRetentionOptions): Collector => ({
  name: 'audit-retention',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS).toISOString()
    const removed = await options.events.removeOlderThan(cutoff)
    logger.info('audit.retention', { cutoff, removed, retentionDays: options.retentionDays })
  },
})
