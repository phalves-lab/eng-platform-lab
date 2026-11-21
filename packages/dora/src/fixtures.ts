import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { type Change, ChangeSchema, type Deploy, DeploySchema } from '@lab/database'
import { z } from 'zod'
import { DoraCatalogError } from './catalog.js'

export interface RepoDelivery {
  deploys: Deploy[]
  changes: Change[]
}

const FixtureFileSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  deploys: z.array(DeploySchema.omit({ repo: true })),
  changes: z.array(ChangeSchema.omit({ repo: true })),
})

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/**
 * Reads the synthetic deploys and merged pull requests of the lab, one JSON file per repository,
 * keyed by repository name. A missing directory means no fixture.
 */
export const loadDeliveryFixtures = async (
  directory: string,
): Promise<Map<string, RepoDelivery>> => {
  let files: string[]
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()
  } catch (error) {
    if (isMissing(error)) return new Map()
    throw error
  }
  const fixtures = new Map<string, RepoDelivery>()
  for (const file of files) {
    const parsed = FixtureFileSchema.safeParse(
      JSON.parse(await readFile(join(directory, file), 'utf8')),
    )
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
        .join('; ')
      throw new DoraCatalogError(`${file} inválido: ${issues}`)
    }
    const { repo, deploys, changes } = parsed.data
    fixtures.set(repo, {
      deploys: deploys.map((deploy) => ({ ...deploy, repo })),
      changes: changes.map((change) => ({ ...change, repo })),
    })
  }
  return fixtures
}
