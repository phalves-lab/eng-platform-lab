import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type RepoFacts, RepoFactsSchema, type RepoSource } from './facts.js'

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/** Serves synthetic facts from `<directory>/<catalog id>.json`, for tests and the lab demo. */
export const createFixtureRepoSource = (directory: string): RepoSource => ({
  facts: async (entry): Promise<RepoFacts> => {
    let text: string
    try {
      text = await readFile(join(directory, `${entry.id}.json`), 'utf8')
    } catch (error) {
      if (isMissing(error)) {
        throw new Error(`Sem fixture de scorecard para ${entry.id}`, { cause: error })
      }
      throw error
    }
    const parsed = RepoFactsSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      throw new Error(`Fixture de scorecard inválida para ${entry.id}: ${parsed.error.message}`)
    }
    return parsed.data
  },
})
