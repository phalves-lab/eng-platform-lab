import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectOptions } from '@lab/eng-metrics/collect'
import { z } from 'zod'

const fromRepo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const DEFAULT_FIXTURES = fromRepo('fixtures/jira')
const DATASETS = ['lab', 'demo'] as const

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL'),
    WORKER_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
    WORKER_CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    WORKER_TIMEZONE: z
      .string()
      .default('America/Sao_Paulo')
      .refine(isTimeZone, 'WORKER_TIMEZONE must be an IANA time zone'),
    WORKER_DATASETS: z
      .string()
      .default('lab')
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(DATASETS)).min(1, 'WORKER_DATASETS needs at least one of lab, demo')),
    WORKER_TASK_SOURCE: z.enum(['fixtures', 'jira']).default('fixtures'),
    WORKER_FIXTURES_DIR: z.string().min(1).default(DEFAULT_FIXTURES),
    WORKER_DORA_CATALOG: z.string().min(1).default(fromRepo('catalog/dora/repos.yaml')),
    WORKER_INCIDENTS_DIR: z.string().min(1).default(fromRepo('catalog/incidents')),
    WORKER_DORA_FIXTURES_DIR: z.string().min(1).default(fromRepo('fixtures/dora')),
    GITHUB_API_URL: z.url().default('https://api.github.com'),
    GITHUB_TOKEN: z.string().default(''),
    GITHUB_REPOSITORY: z.string().default(''),
    ATLASSIAN_SITE: z.string().default(''),
    ATLASSIAN_EMAIL: z.string().default(''),
    ATLASSIAN_API_TOKEN: z.string().default(''),
    CI: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.WORKER_DATASETS.includes('lab') && (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY)) {
      ctx.addIssue({
        code: 'custom',
        message: 'the lab dataset requires GITHUB_TOKEN and GITHUB_REPOSITORY',
      })
    }
  })

export interface WorkerConfig {
  databaseUrl: string
  intervalMs: number
  timeZone: string
  chatRetentionDays: number
  collect: CollectOptions
  dora: {
    catalogFile: string
    incidentsDir: string
    fixturesDir: string
    github: { token: string; apiUrl: string } | null
  }
}

/** Parses the worker environment once at boot and fails fast on anything missing. */
export const loadConfig = (env: NodeJS.ProcessEnv): WorkerConfig => {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid worker configuration: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  const value = parsed.data
  return {
    databaseUrl: value.DATABASE_URL,
    intervalMs: value.WORKER_INTERVAL_MINUTES * 60_000,
    timeZone: value.WORKER_TIMEZONE,
    chatRetentionDays: value.WORKER_CHAT_RETENTION_DAYS,
    collect: {
      demo: value.WORKER_DATASETS.includes('demo'),
      lab: value.WORKER_DATASETS.includes('lab')
        ? {
            token: value.GITHUB_TOKEN,
            repository: value.GITHUB_REPOSITORY,
            taskSource: value.WORKER_TASK_SOURCE,
            fixturesDir: resolve(value.WORKER_FIXTURES_DIR),
            jira: {
              site: value.ATLASSIAN_SITE,
              email: value.ATLASSIAN_EMAIL,
              apiToken: value.ATLASSIAN_API_TOKEN,
            },
            ci: value.CI === 'true',
          }
        : null,
    },
    dora: {
      catalogFile: resolve(value.WORKER_DORA_CATALOG),
      incidentsDir: resolve(value.WORKER_INCIDENTS_DIR),
      fixturesDir: resolve(value.WORKER_DORA_FIXTURES_DIR),
      github: value.GITHUB_TOKEN
        ? { token: value.GITHUB_TOKEN, apiUrl: value.GITHUB_API_URL }
        : null,
    },
  }
}
