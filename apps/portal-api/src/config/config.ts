import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const CONFIG = Symbol('CONFIG')

/** Lab folder of this repository, resolved from the module so the default works from any cwd. */
const fromRepo = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

const emptyAsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const withoutTrailingSlash = (url: string) => (url.endsWith('/') ? url.slice(0, -1) : url)

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    PORTAL_HANDBOOK_DIR: z.string().min(1),
    PORTAL_PANEL_DATA: z.string().min(1).optional(),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL')
      .optional(),
    PORTAL_AUTH_MODE: z.enum(['dev', 'entra']).default('dev'),
    PORTAL_DEV_USER: z.string().default('dev.local'),
    PORTAL_JWKS_URL: z.url().optional(),
    PORTAL_JWT_ISSUER: z.string().optional(),
    PORTAL_JWT_AUDIENCE: z.string().optional(),
    PORTAL_LEAD_LOGINS: z.string().default(''),
    PORTAL_MARKETPLACE_DIR: z.string().min(1).default(fromRepo('fixtures/marketplace')),
    PORTAL_AI_CATALOG_DIR: z.string().min(1).default(fromRepo('catalog/ai')),
    PORTAL_GITHUB_TOKEN: z
      .string()
      .optional()
      .transform((token) => token?.trim() || null),
    PORTAL_GITHUB_API_URL: z.url().default('https://api.github.com'),
    PORTAL_RELEASES_DIR: z.string().min(1).optional(),
    PORTAL_RELEASE_WRITE_ENABLED: z.preprocess(
      emptyAsUnset,
      z.enum(['true', 'false']).default('false'),
    ),
    PORTAL_GITHUB_WRITE_TOKEN: z.preprocess(emptyAsUnset, z.string().trim().min(1).optional()),
    PORTAL_DORA_CATALOG: z.string().min(1).default(fromRepo('catalog/dora/repos.yaml')),
    PORTAL_INCIDENTS_DIR: z.string().min(1).default(fromRepo('catalog/incidents')),
    PORTAL_DORA_FIXTURES_DIR: z.string().min(1).default(fromRepo('fixtures/dora')),
    PORTAL_JIRA_WORKFLOW: z.preprocess(
      emptyAsUnset,
      z.string().min(1).default(fromRepo('catalog/jira/workflow.yaml')),
    ),
    PORTAL_LLM_BASE_URL: z.preprocess(emptyAsUnset, z.url().optional()),
    PORTAL_LLM_API_KEY: z.preprocess(emptyAsUnset, z.string().optional()),
    PORTAL_LLM_MODEL: z.preprocess(emptyAsUnset, z.string().optional()),
    PORTAL_LLM_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(30_000),
    PORTAL_LLM_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(8).default(4),
    PORTAL_SCORECARD_DATA: z.preprocess(emptyAsUnset, z.string().min(1).optional()),
    PORTAL_DOCS_MAX_AGE_MONTHS: z.coerce.number().int().min(1).max(36).default(6),
    PORTAL_TASKS_DIR: z.preprocess(
      emptyAsUnset,
      z.string().min(1).default(fromRepo('fixtures/jira')),
    ),
  })
  .superRefine((env, ctx) => {
    if (!env.DATABASE_URL && !env.PORTAL_PANEL_DATA) {
      ctx.addIssue({ code: 'custom', message: 'set DATABASE_URL or PORTAL_PANEL_DATA' })
    }
    if (env.NODE_ENV === 'production' && env.PORTAL_AUTH_MODE === 'dev') {
      ctx.addIssue({ code: 'custom', message: 'PORTAL_AUTH_MODE=dev is not allowed in production' })
    }
    if (
      env.PORTAL_AUTH_MODE === 'entra' &&
      (!env.PORTAL_JWKS_URL || !env.PORTAL_JWT_ISSUER || !env.PORTAL_JWT_AUDIENCE)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'entra mode requires PORTAL_JWKS_URL, PORTAL_JWT_ISSUER and PORTAL_JWT_AUDIENCE',
      })
    }
    const llm = [env.PORTAL_LLM_BASE_URL, env.PORTAL_LLM_API_KEY, env.PORTAL_LLM_MODEL]
    if (llm.some(Boolean) && !llm.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        message: 'model mode requires PORTAL_LLM_BASE_URL, PORTAL_LLM_API_KEY and PORTAL_LLM_MODEL',
      })
    }
    if (env.PORTAL_RELEASE_WRITE_ENABLED === 'true') {
      if (!env.PORTAL_GITHUB_WRITE_TOKEN || !env.PORTAL_GITHUB_TOKEN?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message:
            'PORTAL_RELEASE_WRITE_ENABLED=true requires PORTAL_GITHUB_TOKEN and PORTAL_GITHUB_WRITE_TOKEN',
        })
      }
      if (!env.DATABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          message: 'PORTAL_RELEASE_WRITE_ENABLED=true requires DATABASE_URL for the release audit',
        })
      }
    }
    if (env.NODE_ENV === 'production' && env.PORTAL_LLM_BASE_URL?.startsWith('http://')) {
      ctx.addIssue({ code: 'custom', message: 'PORTAL_LLM_BASE_URL must use https in production' })
    }
  })

export type PortalConfig = {
  env: 'development' | 'test' | 'production'
  port: number
  handbookDir: string
  panelSource: { kind: 'database'; url: string } | { kind: 'file'; path: string }
  auth:
    | { mode: 'dev'; devUser: string }
    | { mode: 'entra'; jwksUrl: string; issuer: string; audience: string }
  leadLogins: string[]
  marketplaceDir: string
  aiCatalogDir: string
  github: { token: string | null; apiUrl: string }
  releasesDir: string
  releaseWrite: { enabled: boolean; token: string | null }
  dora: { catalogFile: string; incidentsDir: string; fixturesDir: string }
  jiraWorkflowPath: string
  llm: LlmConfig | null
  scorecardData: string
  docsMaxAgeMonths: number
  tasksDir: string
}

type LlmConfig = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  maxToolRounds: number
}

/** Parses the environment once at boot and fails fast on invalid or unsafe settings. */
export const loadConfig = (env: NodeJS.ProcessEnv): PortalConfig => {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid portal configuration: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  const value = parsed.data
  return {
    env: value.NODE_ENV,
    port: value.PORT,
    handbookDir: resolve(value.PORTAL_HANDBOOK_DIR),
    panelSource: value.DATABASE_URL
      ? { kind: 'database', url: value.DATABASE_URL }
      : { kind: 'file', path: resolve(value.PORTAL_PANEL_DATA ?? '') },
    auth:
      value.PORTAL_AUTH_MODE === 'entra'
        ? {
            mode: 'entra',
            jwksUrl: value.PORTAL_JWKS_URL ?? '',
            issuer: value.PORTAL_JWT_ISSUER ?? '',
            audience: value.PORTAL_JWT_AUDIENCE ?? '',
          }
        : { mode: 'dev', devUser: value.PORTAL_DEV_USER },
    leadLogins: value.PORTAL_LEAD_LOGINS.split(',')
      .map((login) => login.trim())
      .filter(Boolean),
    marketplaceDir: resolve(value.PORTAL_MARKETPLACE_DIR),
    aiCatalogDir: resolve(value.PORTAL_AI_CATALOG_DIR),
    github: {
      token: value.PORTAL_GITHUB_TOKEN,
      apiUrl: value.PORTAL_GITHUB_API_URL.replace(/\/$/, ''),
    },
    releasesDir: value.PORTAL_RELEASES_DIR
      ? resolve(value.PORTAL_RELEASES_DIR)
      : resolve(value.PORTAL_HANDBOOK_DIR, '../catalog/releases'),
    releaseWrite: {
      enabled: value.PORTAL_RELEASE_WRITE_ENABLED === 'true',
      token: value.PORTAL_GITHUB_WRITE_TOKEN ?? null,
    },
    dora: {
      catalogFile: resolve(value.PORTAL_DORA_CATALOG),
      incidentsDir: resolve(value.PORTAL_INCIDENTS_DIR),
      fixturesDir: resolve(value.PORTAL_DORA_FIXTURES_DIR),
    },
    jiraWorkflowPath: resolve(value.PORTAL_JIRA_WORKFLOW),
    llm:
      value.PORTAL_LLM_BASE_URL && value.PORTAL_LLM_API_KEY && value.PORTAL_LLM_MODEL
        ? {
            baseUrl: withoutTrailingSlash(value.PORTAL_LLM_BASE_URL),
            apiKey: value.PORTAL_LLM_API_KEY,
            model: value.PORTAL_LLM_MODEL,
            timeoutMs: value.PORTAL_LLM_TIMEOUT_MS,
            maxToolRounds: value.PORTAL_LLM_MAX_TOOL_ROUNDS,
          }
        : null,
    scorecardData: value.PORTAL_SCORECARD_DATA
      ? resolve(value.PORTAL_SCORECARD_DATA)
      : resolve(value.PORTAL_HANDBOOK_DIR, '../.portal-data/scorecard.json'),
    docsMaxAgeMonths: value.PORTAL_DOCS_MAX_AGE_MONTHS,
    tasksDir: resolve(value.PORTAL_TASKS_DIR),
  }
}
