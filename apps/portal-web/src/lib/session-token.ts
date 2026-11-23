import { z } from 'zod'

/** Access token kept only in the encrypted session cookie, never sent to the browser as data. */
export interface ApiToken {
  accessToken: string
  expiresAt: number
  refreshToken: string | null
  error?: 'RefreshTokenError'
}

export interface SignInAccount {
  access_token?: string
  expires_at?: number
  expires_in?: number
  refresh_token?: string
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface RefreshOptions {
  issuer: string
  clientId: string
  clientSecret: string
  scope: string
  fetch?: Fetch
  now?: () => number
}

const REFRESH_MARGIN_SECONDS = 300

const ApiTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().int(),
  refreshToken: z.string().min(1).nullable(),
  error: z.literal('RefreshTokenError').optional(),
})

/** Reads the token stored in the session JWT, or null when it is missing or malformed. */
export const parseApiToken = (value: unknown): ApiToken | null => {
  const parsed = ApiTokenSchema.safeParse(value)
  if (!parsed.success) return null
  const { error, ...token } = parsed.data
  return error ? { ...token, error } : token
}

const DiscoverySchema = z.object({ token_endpoint: z.url() })

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
})

const nowInSeconds = () => Math.floor(Date.now() / 1000)

/** Token fields read from the account Auth.js hands over right after sign-in. */
export const tokenFromAccount = (account: SignInAccount, now = nowInSeconds()): ApiToken | null => {
  if (!account.access_token) return null
  const expiresAt = account.expires_at ?? now + (account.expires_in ?? 0)
  return {
    accessToken: account.access_token,
    expiresAt,
    refreshToken: account.refresh_token ?? null,
  }
}

/**
 * True when the token is about to expire. The margin lets the middleware refresh it while the
 * old one is still valid for the server components of the same request, which read the cookie
 * sent by the browser.
 */
export const needsRefresh = (token: ApiToken, now = nowInSeconds()) =>
  token.expiresAt - now < REFRESH_MARGIN_SECONDS

/** Whether the session can still call the portal-api with this token. */
export const isUsable = (token: ApiToken | null, now = nowInSeconds()): token is ApiToken =>
  token !== null && !token.error && token.expiresAt > now

const tokenEndpoint = async (issuer: string, fetcher: Fetch) => {
  const response = await fetcher(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`discovery answered ${response.status}`)
  return DiscoverySchema.parse(await response.json()).token_endpoint
}

/**
 * Swaps the refresh token for a new access token at the issuer token endpoint. Any failure marks
 * the token with `RefreshTokenError`, which the portal shows as an expired session.
 */
export const refreshApiToken = async (
  token: ApiToken,
  options: RefreshOptions,
): Promise<ApiToken> => {
  const fetcher = options.fetch ?? fetch
  const now = options.now ?? nowInSeconds
  if (!token.refreshToken) return { ...token, error: 'RefreshTokenError' }
  try {
    const response = await fetcher(await tokenEndpoint(options.issuer, fetcher), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        scope: options.scope,
      }),
      cache: 'no-store',
    })
    if (!response.ok) return { ...token, error: 'RefreshTokenError' }
    const body = TokenResponseSchema.parse(await response.json())
    return {
      accessToken: body.access_token,
      expiresAt: now() + body.expires_in,
      refreshToken: body.refresh_token ?? token.refreshToken,
    }
  } catch {
    return { ...token, error: 'RefreshTokenError' }
  }
}

/**
 * Headers the Next server adds to every portal-api call: the bearer token in `entra` mode and the
 * browser address, so the API audit can keep its network part.
 */
export const upstreamHeaders = (
  token: ApiToken | null,
  forwardedFor: string | null,
): Record<string, string> => ({
  ...(token ? { Authorization: `Bearer ${token.accessToken}` } : {}),
  ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
})
