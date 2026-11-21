import type { User } from '@lab/contracts'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { PortalConfig } from '../config/config.js'

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER')

export interface TokenVerifier {
  verify(token: string): Promise<User>
}

type EntraAuth = Extract<PortalConfig['auth'], { mode: 'entra' }>

const roleOf = (roles: unknown, login: string, leads: string[]): User['role'] => {
  const list = Array.isArray(roles) ? roles.map(String) : []
  if (list.includes('portal.admin')) return 'admin'
  if (list.includes('portal.lead') || leads.includes(login)) return 'lead'
  return 'dev'
}

/** Verifies Entra ID access tokens against the tenant JWKS and maps claims to a portal user. */
export const createEntraVerifier = (auth: EntraAuth, leads: string[]): TokenVerifier => {
  const keys = createRemoteJWKSet(new URL(auth.jwksUrl))
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, keys, {
        issuer: auth.issuer,
        audience: auth.audience,
      })
      const login = String(payload['preferred_username'] ?? payload.sub ?? '')
      if (!login) throw new Error('token without subject')
      return {
        login,
        name: String(payload['name'] ?? login),
        role: roleOf(payload['roles'], login, leads),
      }
    },
  }
}
