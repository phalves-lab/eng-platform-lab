import { parseArgs } from 'node:util'
import {
  ConversationRepository,
  ChangeRepository,
  DeployRepository,
  IncidentRepository,
  MetricSnapshotRepository,
  createPool,
  runMigrations,
} from '@lab/database'
import { collectPanelData } from '@lab/eng-metrics/collect'
import { createChatRetentionCollector } from './collectors/chat-retention.js'
import { createDoraCollector } from './collectors/dora/collector.js'
import { createFixtureSource } from './collectors/dora/fixture-source.js'
import { createGitHubSource } from './collectors/dora/github-source.js'
import { createEngMetricsCollector } from './collectors/eng-metrics.js'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'
import { Scheduler } from './scheduler.js'

const logger = createLogger(undefined, { service: 'portal-worker' })

const main = async () => {
  const { values } = parseArgs({ options: { once: { type: 'boolean', default: false } } })
  const config = loadConfig(process.env)
  const pool = createPool({
    connectionString: config.databaseUrl,
    applicationName: 'portal-worker',
  })
  logger.info('migrations.applied', { applied: await runMigrations(pool) })

  const scheduler = new Scheduler({
    logger,
    collectors: [
      createEngMetricsCollector({
        snapshots: new MetricSnapshotRepository(pool),
        collect: (now) => collectPanelData(config.collect, now),
        intervalMs: config.intervalMs,
        timeZone: config.timeZone,
      }),
      createChatRetentionCollector({
        conversations: new ConversationRepository(pool),
        retentionDays: config.chatRetentionDays,
        intervalMs: config.intervalMs,
      }),
      createDoraCollector({
        catalogFile: config.dora.catalogFile,
        incidentsDir: config.dora.incidentsDir,
        fixtures: createFixtureSource(config.dora.fixturesDir),
        github: config.dora.github ? createGitHubSource(config.dora.github) : null,
        deploys: new DeployRepository(pool),
        changes: new ChangeRepository(pool),
        incidents: new IncidentRepository(pool),
        intervalMs: config.intervalMs,
      }),
    ],
  })

  if (values.once) {
    const results = await scheduler.runAll()
    await pool.end()
    process.exitCode = results.every((result) => result.status === 'ok') ? 0 : 1
    return
  }

  scheduler.start()
  const shutdown = async (signal: string) => {
    logger.info('worker.stopping', { signal })
    await scheduler.stop()
    await pool.end()
  }
  process.once('SIGINT', (signal) => void shutdown(signal))
  process.once('SIGTERM', (signal) => void shutdown(signal))
}

main().catch((error: unknown) => {
  logger.error('worker.crashed', { error })
  process.exit(1)
})
