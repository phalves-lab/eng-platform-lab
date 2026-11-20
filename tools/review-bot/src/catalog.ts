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

export interface PullCatalog {
  modules: CatalogModule[]
  invalid: string[]
}

/**
 * Lê o catálogo como está no PR. Diferente da base, cadastro quebrado não derruba o review:
 * o arquivo vai para `invalid` e vira pendência no comentário.
 */
export const loadPullCatalog = async (directory: string): Promise<PullCatalog> => {
  const entries = await readdir(directory).catch(() => [] as string[])
  const files = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort()
  const modules: CatalogModule[] = []
  const invalid: string[] = []
  for (const file of files) {
    try {
      modules.push(moduleSchema.parse(parse(await readFile(join(directory, file), 'utf8'))))
    } catch {
      invalid.push(file)
    }
  }
  return { modules, invalid }
}

export interface MergedCatalog {
  modules: CatalogModule[]
  added: string[]
}

/**
 * Junta o catálogo da base com o do PR. Módulo que já existe mantém os dados da base (dono,
 * tier, página) e só ganha os caminhos novos; módulo que só existe no PR entra como cadastrado
 * no próprio PR. A base é a fonte confiável, o PR só pode acrescentar.
 */
export const mergeCatalogs = (base: CatalogModule[], pull: CatalogModule[]): MergedCatalog => {
  const modules = base.map((module) => {
    const fromPull = pull.find((m) => m.name === module.name)
    if (!fromPull) return module
    return { ...module, paths: [...new Set([...module.paths, ...fromPull.paths])] }
  })
  const added = pull.filter((m) => !base.some((b) => b.name === m.name))
  return { modules: [...modules, ...added], added: added.map((m) => m.name) }
}

export interface ReviewCatalog extends MergedCatalog {
  invalid: string[]
}

/**
 * Catálogo usado no review: o da base junto com o do PR. Quando base e PR são a mesma pasta
 * (review local), a pasta é lida uma vez com a leitura tolerante, para cadastro inválido virar
 * pendência em vez de derrubar o review.
 */
export const loadReviewCatalog = async (
  baseDir: string,
  pullDir: string,
): Promise<ReviewCatalog> => {
  const pull = await loadPullCatalog(pullDir)
  const base = baseDir === pullDir ? pull.modules : await loadCatalog(baseDir)
  return { ...mergeCatalogs(base, pull.modules), invalid: pull.invalid }
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

const MODULE_ROOTS = ['apps/', 'tools/']

/** Arquivos de código de produto que nenhum módulo do catálogo reivindica. */
export const filesOutsideCatalog = (catalog: CatalogModule[], files: string[]): string[] =>
  files.filter(
    (file) =>
      MODULE_ROOTS.some((root) => file.startsWith(root)) &&
      !catalog.some((module) => module.paths.some((p) => matchesPath(file, p))),
  )
