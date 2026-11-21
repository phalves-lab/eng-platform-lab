import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type JWTPayload, SignJWT, exportJWK, generateKeyPair } from 'jose'

export interface TestIssuer {
  issuer: string
  jwksUrl: string
  audience: string
  sign: (claims: JWTPayload, options?: SignOptions) => Promise<string>
  close: () => Promise<void>
}

interface SignOptions {
  expiresIn?: string | number
  audience?: string
  issuer?: string
  key?: 'published' | 'rogue'
}

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  )

/**
 * Local OpenID Connect issuer for tests: serves a discovery document and a JWKS on 127.0.0.1 and
 * signs RS256 tokens shaped like Entra ID access tokens. A second, unpublished key signs tokens
 * that must be refused. No Microsoft account or tenant is involved.
 */
export const startTestIssuer = async (audience = 'api://portal-lab'): Promise<TestIssuer> => {
  const published = await generateKeyPair('RS256', { extractable: true })
  const rogue = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...(await exportJWK(published.publicKey)), kid: 'lab-key-1', alg: 'RS256' }
  let base = ''
  const server = createServer((request, response) => {
    const send = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.url === '/.well-known/openid-configuration') {
      return send({
        issuer: base,
        jwks_uri: `${base}/keys`,
        id_token_signing_alg_values_supported: ['RS256'],
      })
    }
    if (request.url === '/keys') return send({ keys: [jwk] })
    response.writeHead(404).end()
  })
  const port = await listen(server)
  base = `http://127.0.0.1:${port}`
  return {
    issuer: base,
    jwksUrl: `${base}/keys`,
    audience,
    sign: (claims, options = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'lab-key-1', typ: 'JWT' })
        .setIssuer(options.issuer ?? base)
        .setAudience(options.audience ?? audience)
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? '10m')
        .sign(options.key === 'rogue' ? rogue.privateKey : published.privateKey),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
