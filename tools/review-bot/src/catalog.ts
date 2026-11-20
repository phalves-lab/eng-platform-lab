import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

const moduleSchema = z.object({
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  tier: z.enum(['tier-1', 'tier-2', 'tier-3']),
  businessUnits: z.array(z.string()),
  users: z.string(),
  confluencePageId: z.string().nullable(),
  paths: z.array(z.string()).min(1),
})

export type CatalogModule = z.infer<typeof moduleSchema>

const riskRuleSchema = z.object({
  label: z.string().startsWith('risk:'),
  description: z.string(),
  paths: z.array(z.string()).min(1),
})

export type RiskRule = z.infer<typeof riskRuleSchema>

export const loadCatalog = async (directory: string): Promise<CatalogModule[]> => {
  const files = (await readdir(directory)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  return Promise.all(
    files
      .sort()
      .map(async (file) =>
        moduleSchema.parse(parse(await readFile(join(directory, file), 'utf8'))),
      ),
  )
}

export const loadRiskRules = async (path: string): Promise<RiskRule[]> =>
  z.array(riskRuleSchema).parse(parse(await readFile(path, 'utf8')))

const escapeRegex = (value: string) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/** Casa caminho com padrão: prefixo terminado em "/", glob com "*" e "**", ou caminho exato. */
export const matchesPath = (file: string, pattern: string): boolean => {
  if (pattern.endsWith('/')) return file.startsWith(pattern)
  if (!pattern.includes('*')) return file === pattern
  const source = pattern
    .split('**')
    .map((part) => part.split('*').map(escapeRegex).join('[^/]*'))
    .join('.*')
  return new RegExp(`^${source}$`).test(file)
}

export const modulesForFiles = (catalog: CatalogModule[], files: string[]): CatalogModule[] =>
  catalog.filter((module) => files.some((file) => module.paths.some((p) => matchesPath(file, p))))

export const riskLabelsForFiles = (rules: RiskRule[], files: string[]): RiskRule[] =>
  rules.filter((rule) => files.some((file) => rule.paths.some((p) => matchesPath(file, p))))
