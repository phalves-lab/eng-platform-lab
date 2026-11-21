import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type RepoCatalogEntry,
  RepoCatalogEntrySchema,
  type ScorecardPolicy,
  ScorecardPolicySchema,
} from '@lab/contracts'
import { parse } from 'yaml'
import type { ZodType } from 'zod'

const parseWith = <T>(schema: ZodType<T>, text: string, label: string): T => {
  const parsed = schema.safeParse(parse(text))
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
    .join('; ')
  throw new Error(`${label} inválido: ${issues}`)
}

/** Reads every repository in `catalog/repos`, failing with the file name on a broken entry. */
export const loadRepoCatalog = async (directory: string): Promise<RepoCatalogEntry[]> => {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort()
  const entries: RepoCatalogEntry[] = []
  for (const file of files) {
    const entry = parseWith(
      RepoCatalogEntrySchema,
      await readFile(join(directory, file), 'utf8'),
      `Repositório em ${file}`,
    )
    if (entries.some((known) => known.id === entry.id || known.repo === entry.repo)) {
      throw new Error(`Catálogo de repositórios repete ${entry.id} (${entry.repo}) em ${file}`)
    }
    entries.push(entry)
  }
  return entries
}

export const loadScorecardPolicy = async (path: string): Promise<ScorecardPolicy> =>
  parseWith(ScorecardPolicySchema, await readFile(path, 'utf8'), `Política do scorecard em ${path}`)
