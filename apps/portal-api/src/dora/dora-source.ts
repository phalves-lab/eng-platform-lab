import { type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import {
  type Change,
  ChangeRepository,
  type Deploy,
  DeployRepository,
  type Incident,
  IncidentRepository,
  type Pool,
  createPool,
} from '@lab/database'
import { type RepoDelivery, loadDeliveryFixtures, loadIncidents } from '@lab/dora'
import type { PortalConfig } from '../config/config.js'

export const DORA_SOURCE = Symbol('DORA_SOURCE')

export interface DoraWindow {
  deploysSince: string
  changesSince: string
  incidentsSince: string
}

export interface DoraData {
  deploys: Deploy[]
  changes: Change[]
  incidents: Incident[]
}

export interface DoraSource {
  load: (window: DoraWindow) => Promise<DoraData>
}

const UNDEFINED_TABLE = '42P01'

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

/** Reads what the portal worker stored: deploys, merged changes and incidents. */
export class DatabaseDoraSource implements DoraSource, OnModuleDestroy {
  private readonly deploys: Pick<DeployRepository, 'list'>
  private readonly changes: Pick<ChangeRepository, 'list'>
  private readonly incidents: Pick<IncidentRepository, 'list'>

  constructor(private readonly pool: Pool) {
    this.deploys = new DeployRepository(pool)
    this.changes = new ChangeRepository(pool)
    this.incidents = new IncidentRepository(pool)
  }

  async load(window: DoraWindow): Promise<DoraData> {
    try {
      const [deploys, changes, incidents] = await Promise.all([
        this.deploys.list({ since: window.deploysSince }),
        this.changes.list(window.changesSince),
        this.incidents.list(window.incidentsSince),
      ])
      return { deploys, changes, incidents }
    } catch (error) {
      if (isUndefinedTable(error)) {
        throw new ServiceUnavailableException('DORA data is not available yet')
      }
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

/**
 * Lab mode without a database: the synthetic fixtures and the versioned incidents, read once.
 * The window filtering happens in the DORA computation.
 */
export class FixtureDoraSource implements DoraSource {
  private data: Promise<DoraData> | null = null

  constructor(
    private readonly fixturesDir: string,
    private readonly incidentsDir: string,
  ) {}

  load(): Promise<DoraData> {
    this.data ??= Promise.all([
      loadDeliveryFixtures(this.fixturesDir),
      loadIncidents(this.incidentsDir),
    ]).then(([fixtures, incidents]) => {
      const repos: RepoDelivery[] = [...fixtures.values()]
      return {
        deploys: repos.flatMap((repo) => repo.deploys),
        changes: repos.flatMap((repo) => repo.changes),
        incidents,
      }
    })
    return this.data
  }
}

export const createDoraSource = (config: PortalConfig): DoraSource =>
  config.panelSource.kind === 'database'
    ? new DatabaseDoraSource(
        createPool({
          connectionString: config.panelSource.url,
          applicationName: 'portal-api-dora',
          max: 2,
        }),
      )
    : new FixtureDoraSource(config.dora.fixturesDir, config.dora.incidentsDir)
