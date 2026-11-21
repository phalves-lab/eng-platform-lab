import type { OnModuleDestroy } from '@nestjs/common'
import {
  type AuditEventFilter,
  type AuditEventInput,
  AuditEventRepository,
  type Pool,
  type StoredAuditEvent,
  createPool,
} from '@lab/database'
import type { PortalConfig } from '../config/config.js'

export const AUDIT_STORE = Symbol('AUDIT_STORE')

/** Audit trail storage; without a database there is no store and nothing is recorded. */
export interface AuditStore {
  record(input: AuditEventInput): Promise<StoredAuditEvent>
  list(filter: AuditEventFilter): Promise<StoredAuditEvent[]>
}

class PostgresAuditStore implements AuditStore, OnModuleDestroy {
  private readonly repository: AuditEventRepository

  constructor(private readonly pool: Pool) {
    this.repository = new AuditEventRepository(pool)
  }

  record(input: AuditEventInput) {
    return this.repository.record(input)
  }

  list(filter: AuditEventFilter) {
    return this.repository.list(filter)
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

export const createAuditStore = (source: PortalConfig['panelSource']): AuditStore | null =>
  source.kind === 'database'
    ? new PostgresAuditStore(
        createPool({ connectionString: source.url, max: 3, applicationName: 'portal-api-audit' }),
      )
    : null
