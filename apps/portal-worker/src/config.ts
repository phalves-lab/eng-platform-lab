import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectOptions } from '@lab/eng-metrics/collect'
import { z } from 'zod'
import { withoutTrailingSlashes } from './collectors/jira/source.js'

const fromRepo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const DEFAULT_FIXTURES = fromRepo('fixtures/jira')
const DEFAULT_JIRA_BOARDS = fromRepo('fixtures/jira-board')
const DEFAULT_JIRA_WORKFLOW = fromRepo('catalog/jira/workflow.yaml')
const PROJECT_KEY = /^[A-Z][A-Z0-9]+$/
const DATASETS = ['lab', 'demo'] as const

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const DatabaseUrlSchema = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL')

const list = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const JiraEnvSchema = z
  .object({
    WORKER_JIRA_SOURCE: z.enum(['off', 'fixture', 'cloud']).optional(),
    WORKER_JIRA_FIXTURES_DIR: z.string().min(1).default(DEFAULT_JIRA_BOARDS),
    WORKER_JIRA_WORKFLOW: z.string().min(1).default(DEFAULT_JIRA_WORKFLOW),
    WORKER_JIRA_PROJECTS: z
      .string()
      .default('')
      .transform(list)
      .pipe(z.array(z.string().regex(PROJECT_KEY, 'WORKER_JIRA_PROJECTS takes project keys'))),
    WORKER_JIRA_BOARDS: z
      .string()
      .default('')
      .transform(list)
      .pipe(
        z.array(
          z
            .string()
            .regex(/^[A-Z][A-Z0-9]+=\d+$/, 'WORKER_JIRA_BOARDS takes PROJECT=boardId pairs')
            .transform((pair) => {
              const [project = '', boardId = ''] = pair.split('=')
              return { project, boardId: Number(boardId) }
            }),
        ),
      ),
    WORKER_JIRA_SPRINT_FIELD: z
      .string()
      .regex(/^customfield_\d+$/, 'WORKER_JIRA_SPRINT_FIELD must be a customfield id')
      .default('customfield_10020'),
    WORKER_JIRA_LOOKBACK_DAYS: z.coerce.number().int().min(7).max(730).default(120),
    ATLASSIAN_SITE: z.string().default(''),
    ATLASSIAN_EMAIL: z.string().default(''),
    ATLASSIAN_API_TOKEN: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.WORKER_JIRA_SOURCE !== 'cloud') return
    if (
      !/^https:\/\/[^/]+/.test(env.ATLASSIAN_SITE) ||
      !env.ATLASSIAN_EMAIL ||
      !env.ATLASSIAN_API_TOKEN
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'the cloud Jira source requires ATLASSIAN_SITE (https), ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN',
      })
    }
    if (env.WORKER_JIRA_PROJECTS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'the cloud Jira source requires WORKER_JIRA_PROJECTS',
      })
    }
    const unknown = env.WORKER_JIRA_BOARDS.filter(
      (board) => !env.WORKER_JIRA_PROJECTS.includes(board.project),
    )
    if (unknown.length) {
      ctx.addIssue({
        code: 'custom',
        message: `WORKER_JIRA_BOARDS lists projects outside WORKER_JIRA_PROJECTS: ${unknown.map((b) => b.project).join(', ')}`,
      })
    }
  })

export type JiraConfig = {
  workflowPath: string
  source:
    | { kind: 'fixture'; dir: string }
    | {
        kind: 'cloud'
        credentials: { site: string; email: string; apiToken: string }
        projects: string[]
        boards: { project: string; boardId: number }[]
        sprintField: string
        lookbackDays: number
      }
}

const fail = (messages: string[]): never => {
  throw new Error(`Invalid worker configuration: ${messages.join('; ')}`)
}

const messagesOf = (error: z.ZodError) => error.issues.map((issue) => issue.message)

/**
 * Jira collector settings, or null when it is off. The scheduled worker keeps it off unless
 * `WORKER_JIRA_SOURCE` is set; the one-shot command passes `fixture` as its default.
 */
export const loadJiraConfig = (
  env: NodeJS.ProcessEnv,
  defaultSource: 'off' | 'fixture' = 'off',
): JiraConfig | null => {
  const parsed = JiraEnvSchema.safeParse(env)
  if (!parsed.success) return fail(messagesOf(parsed.error))
  const value = parsed.data
  const source = value.WORKER_JIRA_SOURCE ?? defaultSource
  if (source === 'off') return null
  return {
    workflowPath: resolve(value.WORKER_JIRA_WORKFLOW),
    source:
      source === 'fixture'
        ? { kind: 'fixture', dir: resolve(value.WORKER_JIRA_FIXTURES_DIR) }
        : {
            kind: 'cloud',
            credentials: {
              site: withoutTrailingSlashes(value.ATLASSIAN_SITE),
              email: value.ATLASSIAN_EMAIL,
              apiToken: value.ATLASSIAN_API_TOKEN,
            },
            projects: value.WORKER_JIRA_PROJECTS,
            boards: value.WORKER_JIRA_BOARDS,
            sprintField: value.WORKER_JIRA_SPRINT_FIELD,
            lookbackDays: value.WORKER_JIRA_LOOKBACK_DAYS,
          },
  }
}

/** Settings of `npm run collect:jira`: the database and the Jira source, fixture by default. */
export const loadJiraCommandConfig = (env: NodeJS.ProcessEnv) => {
  const database = DatabaseUrlSchema.safeParse(env.DATABASE_URL)
  if (!database.success) return fail(messagesOf(database.error))
  const jira = loadJiraConfig(env, 'fixture')
  if (!jira) return fail(['WORKER_JIRA_SOURCE=off leaves nothing to collect'])
  return { databaseUrl: database.data, jira }
}

const EnvSchema = z
  .object({
    DATABASE_URL: DatabaseUrlSchema,
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
    WORKER_HEARTBEAT_FILE: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
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
  jira: JiraConfig | null
  heartbeatFile: string | null
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
    jira: loadJiraConfig(env),
    heartbeatFile: value.WORKER_HEARTBEAT_FILE ? resolve(value.WORKER_HEARTBEAT_FILE) : null,
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
