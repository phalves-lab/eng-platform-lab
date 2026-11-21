import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { type Incident, IncidentSchema } from '@lab/database'
import { parse } from 'yaml'
import { type ZodType, z } from 'zod'

export class DoraCatalogError extends Error {
  override readonly name = 'DoraCatalogError'
}

const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/)

/**
 * Where the deploys of a repository come from: the lab fixtures, the GitHub deployments of the
 * production environment, or the completed runs of a deploy workflow on the default branch.
 */
const DeploySourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixture') }),
  z.object({ type: z.literal('github-deployments') }),
  z.object({
    type: z.literal('github-workflow'),
    workflow: z.string().regex(/^[\w.-]+\.ya?ml$/),
  }),
])

export const DoraRepoSchema = z.object({
  repo: repoName,
  team: z.string().min(1).max(64),
  system: z.string().min(1),
  productionEnvironment: z.string().min(1).default('production'),
  defaultBranch: z.string().min(1).default('main'),
  source: DeploySourceSchema,
})
export type DoraRepo = z.infer<typeof DoraRepoSchema>

const DoraCatalogSchema = z.object({ repos: z.array(DoraRepoSchema).min(1) })

/** Incident record as versioned in `catalog/incidents/*.yaml`. */
const IncidentFileSchema = z
  .object({
    id: z.string().regex(/^[A-Z][A-Z0-9]*-[\w-]+$/),
    title: z.string().min(1),
    system: z.string().min(1),
    severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    cause: z
      .object({ repo: repoName, sha: z.string().regex(/^[0-9a-f]{7,40}$/) })
      .nullable()
      .default(null),
  })
  .refine(
    (incident) =>
      incident.endedAt === null || Date.parse(incident.endedAt) >= Date.parse(incident.startedAt),
    { message: 'endedAt must not be before startedAt', path: ['endedAt'] },
  )

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

const describe = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`).join('; ')

const parseFile = <T>(schema: ZodType<T>, text: string, file: string): T => {
  let value: unknown
  try {
    value = parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new DoraCatalogError(`${file} não é YAML válido: ${reason}`)
  }
  const result = schema.safeParse(value)
  if (!result.success) throw new DoraCatalogError(`${file} inválido: ${describe(result.error)}`)
  return result.data
}

/** Reads the repositories measured by DORA. Repeated repositories fail the load. */
export const loadDoraCatalog = async (file: string): Promise<DoraRepo[]> => {
  const { repos } = parseFile(DoraCatalogSchema, await readFile(file, 'utf8'), basename(file))
  const seen = new Set<string>()
  for (const entry of repos) {
    if (seen.has(entry.repo)) {
      throw new DoraCatalogError(`${basename(file)} repete o repositório ${entry.repo}`)
    }
    seen.add(entry.repo)
  }
  return repos
}

/** Reads every incident YAML in the directory; a missing directory means no incident. */
export const loadIncidents = async (directory: string): Promise<Incident[]> => {
  let files: string[]
  try {
    files = (await readdir(directory)).filter((file) => /\.ya?ml$/.test(file)).sort()
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
  const incidents: Incident[] = []
  for (const file of files) {
    const record = parseFile(
      IncidentFileSchema,
      await readFile(join(directory, file), 'utf8'),
      file,
    )
    if (incidents.some((incident) => incident.id === record.id)) {
      throw new DoraCatalogError(`${file} repete o incidente ${record.id}`)
    }
    incidents.push(IncidentSchema.parse(record))
  }
  return incidents
}
