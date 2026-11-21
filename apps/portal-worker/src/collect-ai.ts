import { createPool, runMigrations } from '@lab/database'
import { buildAiQualityCollector } from './collectors/ai-quality/index.js'
import { loadAiCommandConfig } from './config.js'
import { createLogger } from './logger.js'
import { Scheduler } from './scheduler.js'

const logger = createLogger(undefined, { service: 'portal-worker', command: 'collect:ai' })

const main = async () => {
  const config = loadAiCommandConfig(process.env)
  const pool = createPool({
    connectionString: config.databaseUrl,
    applicationName: 'portal-worker',
  })
  logger.info('migrations.applied', { applied: await runMigrations(pool) })
  const scheduler = new Scheduler({
    logger,
    collectors: [await buildAiQualityCollector(config.ai, pool, 60_000)],
  })
  const results = await scheduler.runAll()
  await pool.end()
  process.exitCode = results.every((result) => result.status === 'ok') ? 0 : 1
}

main().catch((error: unknown) => {
  logger.error('collect.crashed', { error })
  process.exit(1)
})
