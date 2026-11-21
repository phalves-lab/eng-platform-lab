import { z } from 'zod'

export const ReleaseSideSchema = z.enum(['front', 'back'])
export type ReleaseSide = z.infer<typeof ReleaseSideSchema>

export const ReleaseSideFilterSchema = z.enum(['front', 'back', 'both'])
export type ReleaseSideFilter = z.infer<typeof ReleaseSideFilterSchema>

export const RepositorySchema = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'repositório deve estar no formato owner/name')

export const BranchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^(?!\/)(?!.*\.\.)(?!.*\/\/)[\w.\-/]+$/, 'nome de branch inválido')
  .refine((name) => !name.endsWith('/') && !name.endsWith('.lock'), 'nome de branch inválido')

const PLACEHOLDER = /\{(yyyy|mm|dd)\}/g

/**
 * Release project as declared in `catalog/releases/*.yaml`. In `branch` mode the release is cut
 * into `releaseBranch`, whose `{yyyy}`, `{mm}` and `{dd}` placeholders are filled on the cut date.
 */
export const ReleaseProjectSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id em kebab-case'),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    repos: z
      .object({ front: RepositorySchema.optional(), back: RepositorySchema.optional() })
      .refine((repos) => Boolean(repos.front ?? repos.back), 'declare ao menos um lado'),
    source: BranchNameSchema.default('develop'),
    target: BranchNameSchema.default('main'),
    mode: z.enum(['pr', 'branch']).default('pr'),
    releaseBranch: z
      .string()
      .trim()
      .default('release/{yyyy}-{mm}-{dd}')
      .refine((pattern) => pattern.startsWith('release/'), 'releaseBranch começa com release/')
      .refine(
        (pattern) => BranchNameSchema.safeParse(pattern.replace(PLACEHOLDER, '0')).success,
        'releaseBranch gera nome de branch inválido',
      ),
    labels: z
      .object({
        release: z.string().trim().min(1).default('release'),
        notes: z.string().trim().min(1).default('pre-release-notes'),
      })
      .default({ release: 'release', notes: 'pre-release-notes' }),
    deploy: z
      .object({
        order: z
          .tuple([ReleaseSideSchema, ReleaseSideSchema])
          .refine(([first, second]) => first !== second, 'ordem de deploy repete o lado')
          .default(['back', 'front']),
        backFirstOnMigration: z.boolean().default(true),
      })
      .default({ order: ['back', 'front'], backFirstOnMigration: true }),
    ticketUrl: z
      .string()
      .trim()
      .refine((url) => url.startsWith('https://') && url.includes('{key}'), 'use https e {key}')
      .optional(),
  })
  .refine((project) => project.source !== project.target, 'origem e destino iguais')
export type ReleaseProject = z.infer<typeof ReleaseProjectSchema>

export const ReleaseBranchesSchema = z.object({
  side: ReleaseSideSchema,
  repo: z.string(),
  defaults: z.object({ source: z.string(), target: z.string() }),
  branches: z.array(z.string()),
})
export type ReleaseBranches = z.infer<typeof ReleaseBranchesSchema>

export const ReleasePullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  mergedAt: z.string(),
})
export type ReleasePull = z.infer<typeof ReleasePullSchema>

export const ReleaseEnvSchema = z.object({
  names: z.array(z.string()),
  notes: z.array(z.string()),
})
export type ReleaseEnv = z.infer<typeof ReleaseEnvSchema>

export const ReleaseTicketSchema = z.object({
  key: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  summary: z.string().nullable(),
  pulls: z.array(ReleasePullSchema),
  authors: z.array(z.string()),
  sql: z.array(z.string()),
  env: ReleaseEnvSchema,
  multiplePulls: z.boolean(),
})
export type ReleaseTicket = z.infer<typeof ReleaseTicketSchema>

export const ReleaseWarningSchema = z.object({
  code: z.enum([
    'nothing-new',
    'target-ahead',
    'conflict',
    'no-cutoff',
    'checks-failing',
    'checks-pending',
    'open-release',
  ]),
  level: z.enum(['info', 'warning', 'danger']),
  message: z.string(),
})
export type ReleaseWarning = z.infer<typeof ReleaseWarningSchema>

export const ReleaseChecksSchema = z.object({
  state: z.enum(['success', 'failure', 'pending', 'none']),
  total: z.number().int(),
  failed: z.array(z.string()),
  pending: z.number().int(),
})
export type ReleaseChecks = z.infer<typeof ReleaseChecksSchema>

export const ReleaseCutoffSchema = z.object({
  kind: z.enum(['release-pr', 'tag', 'none']),
  ref: z.string().nullable(),
  at: z.string().nullable(),
  url: z.string().nullable(),
})
export type ReleaseCutoff = z.infer<typeof ReleaseCutoffSchema>

export const ReleaseOpenPullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  head: z.string(),
  mergeable: z.boolean().nullable(),
})
export type ReleaseOpenPull = z.infer<typeof ReleaseOpenPullSchema>

export const ReleaseSidePreviewSchema = z.object({
  side: ReleaseSideSchema,
  repo: z.string(),
  source: z.string(),
  target: z.string(),
  aheadBy: z.number().int(),
  behindBy: z.number().int(),
  cutoff: ReleaseCutoffSchema,
  pulls: z.number().int(),
  tickets: z.array(ReleaseTicketSchema),
  authors: z.array(z.string()),
  checks: ReleaseChecksSchema,
  openRelease: ReleaseOpenPullSchema.nullable(),
  releaseBranch: z.string().nullable(),
  warnings: z.array(ReleaseWarningSchema),
})
export type ReleaseSidePreview = z.infer<typeof ReleaseSidePreviewSchema>

export const ReleaseDeployOrderSchema = z.object({
  sides: z.array(ReleaseSideSchema),
  reason: z.enum(['migration', 'config']),
})
export type ReleaseDeployOrder = z.infer<typeof ReleaseDeployOrderSchema>

export const ReleasePreviewSchema = z.object({
  project: z.object({ id: z.string(), name: z.string(), mode: z.enum(['pr', 'branch']) }),
  side: ReleaseSideFilterSchema,
  generatedAt: z.string(),
  sides: z.array(ReleaseSidePreviewSchema),
  authors: z.array(z.string()),
  deployOrder: ReleaseDeployOrderSchema.nullable(),
})
export type ReleasePreview = z.infer<typeof ReleasePreviewSchema>

/** Query accepted by the release preview; branches fall back to the project defaults. */
export const ReleasePreviewQuerySchema = z
  .object({
    project: z.string().trim().min(1),
    side: ReleaseSideFilterSchema.default('both'),
    source: BranchNameSchema.optional(),
    target: BranchNameSchema.optional(),
  })
  .refine(
    (query) => !query.source || !query.target || query.source !== query.target,
    'origem e destino iguais',
  )
export type ReleasePreviewQuery = z.infer<typeof ReleasePreviewQuerySchema>
