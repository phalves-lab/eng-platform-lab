import type { Collector } from '../../collector.js'
import { loadRepoCatalog, loadScorecardPolicy } from './catalog.js'
import { createScorecardCollector } from './collector.js'
import type { ScorecardConfig } from './config.js'
import { createFixtureRepoSource } from './fixture-source.js'
import { createGitHubRepoSource } from './github-source.js'
import { createFileScorecardStore } from './store.js'

export { DEFAULT_SCORECARD_OUT, loadScorecardConfig } from './config.js'

/**
 * Wires the scorecard collector from its configuration. In github mode only catalog entries with
 * `source: github` go to the API; fictitious repositories always stay on their fixtures.
 */
export const buildScorecardCollector = async (
  config: ScorecardConfig,
  out: string,
  intervalMs: number,
  fetchImpl?: typeof fetch,
): Promise<Collector> => {
  const fixtures = createFixtureRepoSource(config.fixturesDir)
  const github = config.github
    ? createGitHubRepoSource({ ...config.github, ...(fetchImpl ? { fetchImpl } : {}) })
    : null
  return createScorecardCollector({
    catalog: await loadRepoCatalog(config.reposDir),
    policy: await loadScorecardPolicy(config.policyFile),
    sourceFor: (entry) => (github && entry.source === 'github' ? github : fixtures),
    store: createFileScorecardStore(out),
    intervalMs,
  })
}
