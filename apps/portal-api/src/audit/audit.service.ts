import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import type { AuditPage, AuditQuery } from '@lab/contracts'
import { AUDIT_STORE, type AuditStore } from './audit-store.js'

export const AUDIT_TIME_ZONE = 'America/Sao_Paulo'

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_STORE) private readonly store: AuditStore | null) {}

  /** One page of the trail, newest first; `nextBefore` continues from the last entry shown. */
  async list(query: AuditQuery): Promise<AuditPage> {
    if (!this.store) throw new ServiceUnavailableException('Audit trail needs DATABASE_URL')
    const rows = await this.store.list({
      ...(query.actor ? { actor: query.actor } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from ? { fromDate: query.from } : {}),
      ...(query.to ? { toDate: query.to } : {}),
      ...(query.before ? { before: query.before } : {}),
      timeZone: AUDIT_TIME_ZONE,
      limit: query.limit + 1,
    })
    const entries = rows.slice(0, query.limit)
    return {
      entries,
      nextBefore: rows.length > query.limit ? (entries.at(-1)?.id ?? null) : null,
    }
  }
}
