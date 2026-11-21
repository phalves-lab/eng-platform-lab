import { type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { JiraRepository, type Pool, createPool } from '@lab/database'
import type { FlowDataset } from '@lab/flow'
import type { PortalConfig } from '../config/config.js'

export const JIRA_DATA = Symbol('JIRA_DATA')

/** Mirror of the Jira board written by the worker, read whole per project. */
export interface JiraData {
  projects: () => Promise<string[]>
  load: (project?: string) => Promise<FlowDataset>
}

const UNDEFINED_TABLE = '42P01'

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

export const jiraUnavailable = () =>
  new ServiceUnavailableException('Jira data is not available yet; run the Jira collector')

const guard = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work()
  } catch (error) {
    if (isUndefinedTable(error)) throw jiraUnavailable()
    throw error
  }
}

type ReadRepository = Pick<
  JiraRepository,
  'listProjects' | 'listIssues' | 'listStatusChanges' | 'listSprints' | 'listSprintIssues'
>

export class DatabaseJiraData implements JiraData, OnModuleDestroy {
  constructor(
    private readonly repository: ReadRepository,
    private readonly pool: Pick<Pool, 'end'> | null = null,
  ) {}

  projects(): Promise<string[]> {
    return guard(() => this.repository.listProjects())
  }

  load(project?: string): Promise<FlowDataset> {
    const filter = project ? { project } : {}
    return guard(async () => {
      const [issues, changes, sprints, sprintIssues] = await Promise.all([
        this.repository.listIssues(filter),
        this.repository.listStatusChanges(filter),
        this.repository.listSprints(filter),
        this.repository.listSprintIssues(filter),
      ])
      return { issues, changes, sprints, sprintIssues }
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end()
  }
}

/** Jira data only exists in Postgres; without `DATABASE_URL` the flow routes answer 503. */
export const createJiraData = (source: PortalConfig['panelSource']): JiraData | null => {
  if (source.kind !== 'database') return null
  const pool = createPool({ connectionString: source.url, applicationName: 'portal-api-flow' })
  return new DatabaseJiraData(new JiraRepository(pool), pool)
}
