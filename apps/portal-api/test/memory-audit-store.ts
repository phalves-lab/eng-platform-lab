import {
  type AuditEventFilter,
  type AuditEventInput,
  AuditEventInputSchema,
  type StoredAuditEvent,
} from '@lab/database'
import type { AuditStore } from '../src/audit/audit-store.js'

/** Audit trail kept in memory with the same validation and newest-first order as Postgres. */
export class MemoryAuditStore implements AuditStore {
  readonly events: StoredAuditEvent[] = []

  async record(input: AuditEventInput) {
    const event = {
      ...AuditEventInputSchema.parse(input),
      id: this.events.length + 1,
      at: new Date(Date.UTC(2026, 10, 21, 12, 0, this.events.length)).toISOString(),
    }
    this.events.push(event)
    return event
  }

  async list(filter: AuditEventFilter) {
    return this.events
      .filter((event) => !filter.actor || event.actor === filter.actor)
      .filter((event) => !filter.action || event.action.includes(filter.action))
      .filter((event) => !filter.kind || event.kind === filter.kind)
      .filter((event) => !filter.outcome || event.outcome === filter.outcome)
      .filter((event) => !filter.before || event.id < filter.before)
      .sort((a, b) => b.id - a.id)
      .slice(0, filter.limit ?? 50)
  }
}
