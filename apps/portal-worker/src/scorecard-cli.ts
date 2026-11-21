import { parseArgs } from 'node:util'
import {
  buildScorecardCollector,
  DEFAULT_SCORECARD_OUT,
  loadScorecardConfig,
} from './collectors/scorecard/index.js'
import { createLogger } from './logger.js'
import { Scheduler } from './scheduler.js'

const logger = createLogger(undefined, { service: 'portal-worker' })

const main = async () => {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, source: { type: 'string' } },
  })
  const config = loadScorecardConfig({
    ...process.env,
    ...(values.source ? { WORKER_SCORECARD_SOURCE: values.source } : {}),
  })
  const out = values.out ?? config.out ?? DEFAULT_SCORECARD_OUT
  const collector = await buildScorecardCollector(config, out, 60_000)
  const [result] = await new Scheduler({ logger, collectors: [collector] }).runAll()
  logger.info('scorecard.written', { out, source: config.source })
  process.exitCode = result?.status === 'ok' ? 0 : 1
}

main().catch((error: unknown) => {
  logger.error('scorecard.crashed', { error })
  process.exit(1)
})
