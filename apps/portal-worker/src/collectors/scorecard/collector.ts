import type { RepoCatalogEntry, RepoScorecard, ScorecardPolicy } from '@lab/contracts'
import type { Collector } from '../../collector.js'
import { failedRepo, scoreRepo } from './checks.js'
import type { RepoSource } from './facts.js'
import type { ScorecardStore } from './store.js'

export interface ScorecardCollectorOptions {
  catalog: RepoCatalogEntry[]
  policy: ScorecardPolicy
  sourceFor: (entry: RepoCatalogEntry) => RepoSource
  store: ScorecardStore
  intervalMs: number
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Scores every catalog repository and saves one report. A repository that fails to read is kept
 * in the report with its error, so one broken token or fixture does not hide the others.
 */
export const createScorecardCollector = (options: ScorecardCollectorOptions): Collector => ({
  name: 'scorecard',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ now, logger }) => {
    const repos: RepoScorecard[] = []
    for (const entry of options.catalog) {
      try {
        const facts = await options.sourceFor(entry).facts(entry)
        const scorecard = scoreRepo(entry, facts, options.policy, now)
        logger.info('scorecard.repo', { repo: entry.repo, score: scorecard.score })
        repos.push(scorecard)
      } catch (error) {
        logger.warn('scorecard.repo_failed', { repo: entry.repo, error })
        repos.push(failedRepo(entry, messageOf(error)))
      }
    }
    await options.store.save({ schemaVersion: 1, generatedAt: now.toISOString(), repos })
    logger.info('scorecard.saved', {
      repos: repos.length,
      failed: repos.filter((repo) => repo.error).length,
    })
  },
})
