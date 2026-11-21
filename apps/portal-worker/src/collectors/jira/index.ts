import type { JiraConfig } from '../../config.js'
import { createCloudJiraSource } from './cloud-source.js'
import { createFixtureJiraSource } from './fixture-source.js'
import { createJiraHttp } from './http.js'
import type { JiraSource } from './source.js'

export { createJiraCollector } from './collector.js'

/** Picks the adapter named in the configuration. */
export const createJiraSource = (config: JiraConfig): JiraSource =>
  config.source.kind === 'fixture'
    ? createFixtureJiraSource({ dir: config.source.dir, rebase: true })
    : createCloudJiraSource({
        http: createJiraHttp(config.source.credentials),
        site: config.source.credentials.site,
        projects: config.source.projects,
        boards: config.source.boards,
        sprintField: config.source.sprintField,
        lookbackDays: config.source.lookbackDays,
      })
