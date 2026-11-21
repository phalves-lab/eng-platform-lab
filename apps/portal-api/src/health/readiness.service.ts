import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import type { HealthCheck, ReadinessResponse } from '@lab/contracts'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { DATABASE_PROBE, type DatabaseProbe } from './database-probe.js'

/** Checks what portal-api needs to serve traffic: database, handbook and model settings. */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  constructor(
    @Inject(CONFIG) private readonly config: Pick<PortalConfig, 'llm'>,
    @Inject(HandbookService) private readonly handbook: Pick<HandbookService, 'isLoaded'>,
    @Inject(DATABASE_PROBE) private readonly database: DatabaseProbe,
  ) {}

  async check(): Promise<ReadinessResponse> {
    const handbook: HealthCheck = this.handbook.isLoaded()
      ? { status: 'ok' }
      : { status: 'failed', detail: 'not_loaded' }
    const checks = {
      database: await this.database.check(),
      handbook,
      model: {
        status: 'ok' as const,
        mode: this.config.llm ? ('llm' as const) : ('retrieval' as const),
      },
    }
    const failed = Object.values(checks).some((check) => check.status === 'failed')
    return { status: failed ? 'not_ready' : 'ready', checks }
  }

  onModuleDestroy() {
    return this.database.close()
  }
}
