import type { OnModuleDestroy } from '@nestjs/common'
import type { AiUsageRecord } from '@lab/contracts'
import { AiUsageRepository, type Pool, createPool } from '@lab/database'
import type { UsageSink } from '../ask/model/recording-provider.js'
import type { PortalConfig } from '../config/config.js'

export const AI_USAGE_SINK = Symbol('AI_USAGE_SINK')
export const AI_PRICING = Symbol('AI_PRICING')

/** Stores the chat usage records in Postgres, next to what the worker collects from CI. */
export class DatabaseUsageSink implements UsageSink, OnModuleDestroy {
  private readonly repository: Pick<AiUsageRepository, 'record'>

  constructor(private readonly pool: Pool) {
    this.repository = new AiUsageRepository(pool)
  }

  record(records: AiUsageRecord[]): Promise<number> {
    return this.repository.record(records)
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

/** Without `DATABASE_URL` the chat still answers, and its usage is not kept. */
export const createUsageSink = (config: PortalConfig): DatabaseUsageSink | null =>
  config.panelSource.kind === 'database'
    ? new DatabaseUsageSink(
        createPool({
          connectionString: config.panelSource.url,
          applicationName: 'portal-api-ai-usage',
          max: 2,
        }),
      )
    : null
