import { resolve } from 'node:path'
import { z } from 'zod'

export const CONFIG = Symbol('CONFIG')

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
  }
}
