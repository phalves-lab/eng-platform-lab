import { z } from 'zod'

const emptyAsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyAsUnset, schema.optional())

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORTAL_ENV: optional(z.enum(['development', 'test', 'production'])),
    PORTAL_AUTH_MODE: z.preprocess(emptyAsUnset, z.enum(['dev', 'entra']).default('dev')),
    AUTH_SECRET: optional(z.string().min(32, 'AUTH_SECRET needs at least 32 characters')),
    AUTH_MICROSOFT_ENTRA_ID_ID: optional(z.string().trim().min(1)),
    AUTH_MICROSOFT_ENTRA_ID_SECRET: optional(z.string().min(1)),
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: optional(z.url()),
    PORTAL_API_SCOPE: optional(z.string().trim().min(1)),
  })
  .superRefine((env, ctx) => {
    const production = (env.PORTAL_ENV ?? env.NODE_ENV) === 'production'
    if (production && env.PORTAL_AUTH_MODE === 'dev') {
      ctx.addIssue({ code: 'custom', message: 'PORTAL_AUTH_MODE=dev is not allowed in production' })
    }
    if (env.PORTAL_AUTH_MODE !== 'entra') return
    const missing = (
      [
        'AUTH_SECRET',
        'AUTH_MICROSOFT_ENTRA_ID_ID',
        'AUTH_MICROSOFT_ENTRA_ID_SECRET',
        'AUTH_MICROSOFT_ENTRA_ID_ISSUER',
        'PORTAL_API_SCOPE',
      ] as const
    ).filter((name) => !env[name])
    if (missing.length) {
      ctx.addIssue({ code: 'custom', message: `entra mode requires ${missing.join(', ')}` })
    }
    if (production && env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        message: 'AUTH_MICROSOFT_ENTRA_ID_ISSUER must use https in production',
      })
    }
  })

export type WebAuthConfig =
  | { mode: 'dev' }
  | {
      mode: 'entra'
      secret: string
      clientId: string
      clientSecret: string
      issuer: string
      apiScope: string
    }

/**
 * Reads the sign-in settings of the portal front and fails on unsafe ones, like the API does:
 * the `dev` mode (no sign-in) is refused when `PORTAL_ENV`, or `NODE_ENV` without it, is
 * `production`.
 */
export const readAuthConfig = (env: Record<string, string | undefined>): WebAuthConfig => {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(
      `Invalid portal-web configuration: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  const value = parsed.data
  if (value.PORTAL_AUTH_MODE === 'dev') return { mode: 'dev' }
  return {
    mode: 'entra',
    secret: value.AUTH_SECRET ?? '',
    clientId: value.AUTH_MICROSOFT_ENTRA_ID_ID ?? '',
    clientSecret: value.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? '',
    issuer: (value.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? '').replace(/\/$/, ''),
    apiScope: value.PORTAL_API_SCOPE ?? '',
  }
}

/** Scopes asked at sign-in: OpenID basics, a refresh token and the portal-api scope. */
export const signInScopes = (apiScope: string) => `openid profile email offline_access ${apiScope}`
