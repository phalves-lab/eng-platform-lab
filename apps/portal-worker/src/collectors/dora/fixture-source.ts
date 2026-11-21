import { type RepoDelivery, loadDeliveryFixtures } from '@lab/dora'
import type { DeliverySource } from './source.js'

/** Lab adapter: serves the synthetic deploys and pull requests of `fixtures/dora`. */
export const createFixtureSource = (directory: string): DeliverySource => {
  let fixtures: Promise<Map<string, RepoDelivery>> | null = null
  return {
    collect: async (repo, since) => {
      fixtures ??= loadDeliveryFixtures(directory)
      const data = (await fixtures).get(repo.repo)
      if (!data) return { deploys: [], changes: [] }
      const from = Date.parse(since)
      return {
        deploys: data.deploys.filter((deploy) => Date.parse(deploy.deployedAt) >= from),
        changes: data.changes.filter((change) => Date.parse(change.mergedAt) >= from),
      }
    },
  }
}
