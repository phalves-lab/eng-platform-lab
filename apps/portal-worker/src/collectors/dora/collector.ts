import type { ChangeRepository, DeployRepository, IncidentRepository } from '@lab/database'
import { type DoraRepo, loadDoraCatalog, loadIncidents } from '@lab/dora'
import type { Collector } from '../../collector.js'
import type { DeliverySource } from './source.js'

export interface DoraCollectorOptions {
  catalogFile: string
  incidentsDir: string
  fixtures: DeliverySource
  github: DeliverySource | null
  deploys: Pick<DeployRepository, 'record'>
  changes: Pick<ChangeRepository, 'upsert'>
  incidents: Pick<IncidentRepository, 'upsert'>
  intervalMs: number
  lookbackDays?: number
}

const DAY = 86_400_000
const DEFAULT_LOOKBACK_DAYS = 98

const sourceFor = (repo: DoraRepo, options: DoraCollectorOptions) =>
  repo.source.type === 'fixture' ? options.fixtures : options.github

/**
 * Stores the deploys and merged pull requests of every catalog repository and the versioned
 * incidents. A repository that fails is logged and the others still run; the run fails at the
 * end so the scheduler reports it.
 */
export const createDoraCollector = (options: DoraCollectorOptions): Collector => ({
  name: 'dora',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const repos = await loadDoraCatalog(options.catalogFile)
    const incidents = await loadIncidents(options.incidentsDir)
    await options.incidents.upsert(incidents)
    logger.info('dora.incidents.saved', { incidents: incidents.length })

    const since = new Date(
      now.getTime() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * DAY,
    ).toISOString()
    const failed: string[] = []
    for (const repo of repos) {
      const source = sourceFor(repo, options)
      if (!source) {
        logger.warn('dora.repo.skipped', { repo: repo.repo, reason: 'GITHUB_TOKEN ausente' })
        continue
      }
      try {
        const delivery = await source.collect(repo, since)
        const written = await options.deploys.record(delivery.deploys)
        await options.changes.upsert(delivery.changes)
        logger.info('dora.repo.saved', {
          repo: repo.repo,
          deploys: delivery.deploys.length,
          written,
          changes: delivery.changes.length,
        })
      } catch (error) {
        failed.push(repo.repo)
        logger.error('dora.repo.failed', { repo: repo.repo, error })
      }
    }
    if (failed.length) throw new Error(`Coleta DORA falhou em ${failed.join(', ')}`)
  },
})
