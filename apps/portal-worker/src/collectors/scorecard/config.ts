import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const fromRepo = (path: string) => fileURLToPath(new URL(`../../../../../${path}`, import.meta.url))

const emptyAsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const EnvSchema = z
  .object({
    WORKER_SCORECARD_SOURCE: z.enum(['fixture', 'github']).default('fixture'),
    WORKER_SCORECARD_OUT: z.preprocess(emptyAsUnset, z.string().min(1).optional()),
    WORKER_REPOS_DIR: z.string().min(1).default(fromRepo('catalog/repos')),
    WORKER_SCORECARD_POLICY: z.string().min(1).default(fromRepo('catalog/scorecard/policy.yaml')),
    WORKER_SCORECARD_FIXTURES_DIR: z.string().min(1).default(fromRepo('fixtures/scorecard')),
    GITHUB_TOKEN: z.preprocess(emptyAsUnset, z.string().optional()),
    GITHUB_API_URL: z.url().default('https://api.github.com'),
  })
  .superRefine((env, ctx) => {
    if (env.WORKER_SCORECARD_SOURCE === 'github' && !env.GITHUB_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        message: 'WORKER_SCORECARD_SOURCE=github requires GITHUB_TOKEN',
      })
    }
  })

export interface ScorecardConfig {
  source: 'fixture' | 'github'
  out: string | null
  reposDir: string
  policyFile: string
  fixturesDir: string
  github: { token: string; apiUrl: string } | null
}

/** Scorecard settings of the worker; `out` unset keeps the collector off in the scheduled worker. */
export const loadScorecardConfig = (env: NodeJS.ProcessEnv): ScorecardConfig => {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid scorecard configuration: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  const value = parsed.data
  return {
    source: value.WORKER_SCORECARD_SOURCE,
    out: value.WORKER_SCORECARD_OUT ? resolve(value.WORKER_SCORECARD_OUT) : null,
    reposDir: resolve(value.WORKER_REPOS_DIR),
    policyFile: resolve(value.WORKER_SCORECARD_POLICY),
    fixturesDir: resolve(value.WORKER_SCORECARD_FIXTURES_DIR),
    github:
      value.WORKER_SCORECARD_SOURCE === 'github' && value.GITHUB_TOKEN
        ? { token: value.GITHUB_TOKEN, apiUrl: value.GITHUB_API_URL }
        : null,
  }
}

/** Default output, next to the panel data the portal API already reads in local runs. */
export const DEFAULT_SCORECARD_OUT = fromRepo('.portal-data/scorecard.json')
