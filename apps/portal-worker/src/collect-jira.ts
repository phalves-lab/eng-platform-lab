import { JiraRepository, createPool, runMigrations } from '@lab/database'
import { loadWorkflow } from '@lab/flow'
import { createJiraCollector, createJiraSource } from './collectors/jira/index.js'
import { loadJiraCommandConfig } from './config.js'
import { createLogger } from './logger.js'
import { Scheduler } from './scheduler.js'

const logger = createLogger(undefined, { service: 'portal-worker', command: 'collect:jira' })

const main = async () => {
  const config = loadJiraCommandConfig(process.env)
  const pool = createPool({
    connectionString: config.databaseUrl,
    applicationName: 'portal-worker',
  })
  logger.info('migrations.applied', { applied: await runMigrations(pool) })
  const scheduler = new Scheduler({
    logger,
    collectors: [
      createJiraCollector({
        source: createJiraSource(config.jira),
        repository: new JiraRepository(pool),
        workflow: await loadWorkflow(config.jira.workflowPath),
        intervalMs: 60_000,
      }),
    ],
  })
  const results = await scheduler.runAll()
  await pool.end()
  process.exitCode = results.every((result) => result.status === 'ok') ? 0 : 1
}

main().catch((error: unknown) => {
  logger.error('collect.crashed', { error })
  process.exit(1)
})
