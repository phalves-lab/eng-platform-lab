import type { OnModuleDestroy } from '@nestjs/common'
import { JiraRepository, type Pool, createPool } from '@lab/database'
import type { WorkDataset } from '@lab/flow'
import type { PortalConfig } from '../config/config.js'

export const WORK_DATA = Symbol('WORK_DATA')

/** Jira mirror read whole for the personal and team views; null when it was never collected. */
export interface WorkData {
  load: () => Promise<WorkDataset | null>
}

const UNDEFINED_TABLE = '42P01'

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

type ReadRepository = Pick<JiraRepository, 'listIssues' | 'listStatusChanges' | 'listIssueLinks'>

export class DatabaseWorkData implements WorkData, OnModuleDestroy {
  constructor(
    private readonly repository: ReadRepository,
    private readonly pool: Pick<Pool, 'end'> | null = null,
  ) {}

  async load(): Promise<WorkDataset | null> {
    try {
      const [issues, changes, links] = await Promise.all([
        this.repository.listIssues(),
        this.repository.listStatusChanges(),
        this.repository.listIssueLinks(),
      ])
      return issues.length ? { issues, changes, links } : null
    } catch (error) {
      if (isUndefinedTable(error)) return null
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end()
  }
}

/** The Jira mirror only exists in Postgres; without `DATABASE_URL` the views explain how to link it. */
export const createWorkData = (source: PortalConfig['panelSource']): WorkData | null => {
  if (source.kind !== 'database') return null
  const pool = createPool({ connectionString: source.url, applicationName: 'portal-api-work' })
  return new DatabaseWorkData(new JiraRepository(pool), pool)
}
