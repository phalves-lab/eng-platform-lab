import { readFile } from 'node:fs/promises'
import {
  type PortalRole,
  type RoleMap,
  RoleMapSchema,
  type User,
  highestRole,
  roleFromGroups,
} from '@lab/contracts'
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose'
import { parse } from 'yaml'
import type { PortalConfig } from '../config/config.js'

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER')

export interface TokenVerifier {
  verify(token: string): Promise<User>
}

/** A valid token whose account has no portal role: the guard answers 403, not 401. */
export class AccessDeniedError extends Error {}

type EntraAuth = Extract<PortalConfig['auth'], { mode: 'entra' }>

const APP_ROLES: Record<string, PortalRole> = { 'portal.admin': 'admin', 'portal.lead': 'lead' }

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Entra ID replaces the `groups` claim with `_claim_names.groups` when an account is in too many
 * groups; the portal does not call Microsoft Graph, so such an account cannot be mapped.
 */
const hasGroupOverage = (payload: JWTPayload) => {
  const names = payload['_claim_names']
  return typeof names === 'object' && names !== null && 'groups' in names
}

/** Role of a verified token: the highest among app roles, mapped groups and lead logins. */
export const roleOfClaims = (
  payload: JWTPayload,
  login: string,
  map: RoleMap,
  leads: readonly string[],
): PortalRole => {
  if (hasGroupOverage(payload)) {
    throw new AccessDeniedError('too many groups in the token to map a portal role')
  }
  const candidates: PortalRole[] = strings(payload['roles'])
    .map((role) => APP_ROLES[role])
    .filter((role): role is PortalRole => role !== undefined)
  if (leads.includes(login)) candidates.push('lead')
  const fromGroups = roleFromGroups(map, strings(payload['groups']))
  if (fromGroups) candidates.push(fromGroups)
  const role = highestRole(candidates)
  if (!role) throw new AccessDeniedError('no portal role mapped for this account')
  return role
}

/** Reads and validates the versioned group to role map. */
export const loadRoleMap = async (file: string): Promise<RoleMap> => {
  const parsed = RoleMapSchema.safeParse(parse(await readFile(file, 'utf8')))
  if (!parsed.success) {
    throw new Error(
      `Invalid role map ${file}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  return parsed.data
}

/** Verifies Entra ID access tokens against the tenant JWKS and maps claims to a portal user. */
export const createEntraVerifier = (
  auth: EntraAuth,
  leads: string[],
  map: RoleMap,
): TokenVerifier => {
  const keys = createRemoteJWKSet(new URL(auth.jwksUrl))
  return {
    async verify(token): Promise<User> {
      const { payload } = await jwtVerify(token, keys, {
        issuer: auth.issuer,
        audience: auth.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
      })
      const login = String(payload['preferred_username'] ?? payload.sub ?? '')
      if (!login) throw new Error('token without subject')
      return {
        login,
        name: String(payload['name'] ?? login),
        role: roleOfClaims(payload, login, map, leads),
      }
    },
  }
}
