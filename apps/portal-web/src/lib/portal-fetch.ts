import 'server-only'
import { getToken } from 'next-auth/jwt'
import { headers } from 'next/headers'
import { ApiError } from '@/lib/api-error'
import { readAuthConfig } from '@/lib/auth-config'
import { type ApiToken, isUsable, parseApiToken, upstreamHeaders } from '@/lib/session-token'

const SECURE_COOKIE = '__Secure-authjs.session-token'

export const portalApiUrl = () => process.env.PORTAL_API_URL ?? 'http://localhost:4100'

const sessionToken = async (incoming: Headers, secret: string): Promise<ApiToken | null> => {
  const jwt = await getToken({
    req: { headers: incoming },
    secret,
    secureCookie: (incoming.get('cookie') ?? '').includes(SECURE_COOKIE),
  })
  return parseApiToken(jwt?.['api'])
}

/**
 * The only way the Next server calls the portal-api. In `entra` mode it forwards the access token
 * read from the encrypted session cookie and answers 401 without calling the API when the session
 * is missing or expired; in `dev` mode it calls without a token, as the local API expects.
 */
export const portalFetch = async (
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<Response> => {
  const config = readAuthConfig(process.env)
  const incoming = await headers()
  const token = config.mode === 'entra' ? await sessionToken(incoming, config.secret) : null
  if (config.mode === 'entra' && !isUsable(token)) {
    throw new ApiError(401, `portal session missing or expired on ${path}`)
  }
  return fetch(`${portalApiUrl()}${path}`, {
    ...init,
    headers: { ...init.headers, ...upstreamHeaders(token, incoming.get('x-forwarded-for')) },
    cache: 'no-store',
  })
}
