import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArtifact } from '@lab/llm-usage'
import type { AiArtifactSource } from './source.js'

/** Lab adapter: the synthetic artifacts of `fixtures/ai-evals`, or any local folder of them. */
export const createFixtureArtifactSource = (directory: string): AiArtifactSource => ({
  collect: async () => {
    const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()
    const parsed = await Promise.all(
      files.map(async (file) => parseArtifact(file, await readFile(join(directory, file), 'utf8'))),
    )
    return { source: 'fixture', parsed, failures: [] }
  },
})
