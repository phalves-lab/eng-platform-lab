import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { navGroupsFor } from '../src/components/navigation'
import {
  accessDecision,
  safeCallbackUrl,
  screenForStatus,
  signInErrorMessage,
} from '../src/lib/access'
import { readAuthConfig, signInScopes } from '../src/lib/auth-config'
import {
  type ApiToken,
  isUsable,
  needsRefresh,
  parseApiToken,
  refreshApiToken,
  tokenFromAccount,
  upstreamHeaders,
} from '../src/lib/session-token'

const ENTRA = {
  PORTAL_AUTH_MODE: 'entra',
  AUTH_SECRET: 's'.repeat(32),
  AUTH_MICROSOFT_ENTRA_ID_ID: 'client-lab',
  AUTH_MICROSOFT_ENTRA_ID_SECRET: 'segredo-de-teste',
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: 'https://login.exemplo.invalid/tenant-lab/v2.0/',
  PORTAL_API_SCOPE: 'api://portal-lab/acesso',
}

describe('front sign-in settings', () => {
  it('runs without sign-in locally and refuses that in production', () => {
    expect(readAuthConfig({})).toEqual({ mode: 'dev' })
    expect(readAuthConfig({ NODE_ENV: 'test', PORTAL_AUTH_MODE: '' })).toEqual({ mode: 'dev' })
    expect(() => readAuthConfig({ NODE_ENV: 'production' })).toThrow(
      'PORTAL_AUTH_MODE=dev is not allowed in production',
    )
    expect(() => readAuthConfig({ NODE_ENV: 'development', PORTAL_ENV: 'production' })).toThrow(
      'not allowed in production',
    )
    expect(readAuthConfig({ NODE_ENV: 'production', PORTAL_ENV: 'development' })).toEqual({
      mode: 'dev',
    })
  })

  it('needs every Entra ID setting and https in production', () => {
    expect(readAuthConfig({ ...ENTRA, NODE_ENV: 'production' })).toEqual({
      mode: 'entra',
      secret: 's'.repeat(32),
      clientId: 'client-lab',
      clientSecret: 'segredo-de-teste',
      issuer: 'https://login.exemplo.invalid/tenant-lab/v2.0',
      apiScope: 'api://portal-lab/acesso',
    })
    expect(() => readAuthConfig({ PORTAL_AUTH_MODE: 'entra' })).toThrow(
      'entra mode requires AUTH_SECRET, AUTH_MICROSOFT_ENTRA_ID_ID',
    )
    expect(() => readAuthConfig({ ...ENTRA, AUTH_SECRET: 'curto' })).toThrow('32 characters')
    expect(() =>
      readAuthConfig({
        ...ENTRA,
        NODE_ENV: 'production',
        AUTH_MICROSOFT_ENTRA_ID_ISSUER: 'http://127.0.0.1:9/v2.0',
      }),
    ).toThrow('must use https in production')
    expect(signInScopes('api://x/y')).toBe('openid profile email offline_access api://x/y')
  })
})

const token = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  accessToken: 'at-1',
  expiresAt: 1_000,
  refreshToken: 'rt-1',
  ...overrides,
})

describe('api token in the session', () => {
  it('reads the account handed over at sign-in and the stored token', () => {
    expect(tokenFromAccount({ access_token: 'at', expires_in: 3600 }, 100)).toEqual({
      accessToken: 'at',
      expiresAt: 3700,
      refreshToken: null,
    })
    expect(tokenFromAccount({ access_token: 'at', expires_at: 50, refresh_token: 'rt' })).toEqual({
      accessToken: 'at',
      expiresAt: 50,
      refreshToken: 'rt',
    })
    expect(tokenFromAccount({})).toBeNull()
    expect(parseApiToken(token())).toEqual(token())
    expect(parseApiToken(token({ error: 'RefreshTokenError' }))?.error).toBe('RefreshTokenError')
    expect(parseApiToken({ accessToken: 'x' })).toBeNull()
    expect(parseApiToken(undefined)).toBeNull()
  })

  it('refreshes ahead of expiry and stops using a failed or expired token', () => {
    expect(needsRefresh(token(), 600)).toBe(false)
    expect(needsRefresh(token(), 701)).toBe(true)
    expect(isUsable(token(), 999)).toBe(true)
    expect(isUsable(token(), 1_000)).toBe(false)
    expect(isUsable(token({ error: 'RefreshTokenError' }), 10)).toBe(false)
    expect(isUsable(null)).toBe(false)
  })

  it('sends the bearer token and the browser address to the portal-api only when present', () => {
    expect(upstreamHeaders(token(), '203.0.113.7')).toEqual({
      Authorization: 'Bearer at-1',
      'X-Forwarded-For': '203.0.113.7',
    })
    expect(upstreamHeaders(null, null)).toEqual({})
  })
})

describe('token refresh against a local OIDC issuer', () => {
  let issuer = ''
  let tokenStatus = 200
  let rotate = true
  const forms: URLSearchParams[] = []
  const server = createServer(async (request: IncomingMessage, response) => {
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.url === '/.well-known/openid-configuration') {
      return json(200, { issuer, token_endpoint: `${issuer}/token` })
    }
    if (request.url === '/token' && request.method === 'POST') {
      let body = ''
      for await (const chunk of request) body += String(chunk)
      forms.push(new URLSearchParams(body))
      return json(tokenStatus, {
        access_token: 'at-2',
        expires_in: 3600,
        ...(rotate ? { refresh_token: 'rt-2' } : {}),
      })
    }
    json(404, {})
  })

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  const options = () => ({
    issuer,
    clientId: 'client-lab',
    clientSecret: 'segredo-de-teste',
    scope: signInScopes('api://portal-lab/acesso'),
    now: () => 5_000,
  })

  it('swaps the refresh token at the discovered token endpoint', async () => {
    expect(await refreshApiToken(token(), options())).toEqual({
      accessToken: 'at-2',
      expiresAt: 8_600,
      refreshToken: 'rt-2',
    })
    expect(Object.fromEntries(forms[0] ?? [])).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rt-1',
      client_id: 'client-lab',
      scope: 'openid profile email offline_access api://portal-lab/acesso',
    })
    rotate = false
    expect((await refreshApiToken(token(), options())).refreshToken).toBe('rt-1')
  })

  it('marks the session as expired when the refresh cannot happen', async () => {
    tokenStatus = 400
    expect((await refreshApiToken(token(), options())).error).toBe('RefreshTokenError')
    expect((await refreshApiToken(token({ refreshToken: null }), options())).error).toBe(
      'RefreshTokenError',
    )
    expect((await refreshApiToken(token(), { ...options(), issuer: `${issuer}/nada` })).error).toBe(
      'RefreshTokenError',
    )
    expect(
      (
        await refreshApiToken(token(), {
          ...options(),
          fetch: () => Promise.reject(new Error('x')),
        })
      ).error,
    ).toBe('RefreshTokenError')
  })
})

describe('access rules of the middleware', () => {
  const at = (pathname: string, state: { signedIn?: boolean; expired?: boolean } = {}) =>
    accessDecision({
      pathname,
      search: '?time=Campanhas',
      signedIn: state.signedIn ?? false,
      expired: state.expired ?? false,
    })

  it('lets sign-in pages and Auth.js routes through', () => {
    for (const path of ['/entrar', '/acesso-negado', '/sessao-expirada', '/api/auth/callback/x']) {
      expect(at(path)).toEqual({ kind: 'next' })
    }
  })

  it('sends people without a session to sign in and keeps where they were going', () => {
    expect(at('/entregas/dora')).toEqual({
      kind: 'redirect',
      to: '/entrar?callbackUrl=%2Fentregas%2Fdora%3Ftime%3DCampanhas',
    })
    expect(at('/entregas/dora', { signedIn: true, expired: true })).toEqual({
      kind: 'redirect',
      to: '/sessao-expirada?callbackUrl=%2Fentregas%2Fdora%3Ftime%3DCampanhas',
    })
    expect(at('/api/conversations')).toEqual({ kind: 'unauthorized' })
    expect(at('/api/conversations', { signedIn: true, expired: true })).toEqual({
      kind: 'unauthorized',
    })
    expect(at('/', { signedIn: true })).toEqual({ kind: 'next' })
  })

  it('keeps redirects inside the portal and maps API refusals to screens', () => {
    expect(safeCallbackUrl('/releases?projeto=demo')).toBe('/releases?projeto=demo')
    for (const value of ['https://fora.invalid', '//fora.invalid', '/\\fora', '/entrar', 3]) {
      expect(safeCallbackUrl(value)).toBe('/')
    }
    expect(screenForStatus(401)).toBe('/sessao-expirada')
    expect(screenForStatus(403)).toBe('/acesso-negado')
    expect(screenForStatus(500)).toBeNull()
    expect(signInErrorMessage('AccessDenied')).toContain('não tem permissão')
    expect(signInErrorMessage('OAuthCallbackError')).toContain('Tente de novo')
    expect(signInErrorMessage(undefined)).toBeNull()
  })

  it('shows the administration menu only to admins', () => {
    const hrefs = (role: 'dev' | 'lead' | 'admin') =>
      navGroupsFor(role).flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs('admin')).toContain('/admin/auditoria')
    expect(hrefs('lead')).not.toContain('/admin/auditoria')
    expect(navGroupsFor('dev').map((group) => group.label)).not.toContain('Administração')
  })
})
