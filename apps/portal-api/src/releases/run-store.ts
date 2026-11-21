import type { OnModuleDestroy } from '@nestjs/common'
import {
  type Pool,
  type ReleaseRunFilter,
  type ReleaseRunInput,
  ReleaseRunRepository,
  type StoredReleaseRun,
  createPool,
} from '@lab/database'
import type { PortalConfig } from '../config/config.js'

export const RELEASE_RUN_STORE = Symbol('RELEASE_RUN_STORE')

/** Audit of release writes; without a database there is no store and nothing can be written. */
export interface ReleaseRunStore {
  record(input: ReleaseRunInput): Promise<StoredReleaseRun>
  list(filter: ReleaseRunFilter): Promise<StoredReleaseRun[]>
}

class PostgresReleaseRunStore implements ReleaseRunStore, OnModuleDestroy {
  private readonly repository: ReleaseRunRepository

  constructor(private readonly pool: Pool) {
    this.repository = new ReleaseRunRepository(pool)
  }

  record(input: ReleaseRunInput) {
    return this.repository.record(input)
  }

  list(filter: ReleaseRunFilter) {
    return this.repository.list(filter)
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

export const createReleaseRunStore = (
  source: PortalConfig['panelSource'],
): ReleaseRunStore | null =>
  source.kind === 'database'
    ? new PostgresReleaseRunStore(
        createPool({ connectionString: source.url, applicationName: 'portal-api-releases' }),
      )
    : null
