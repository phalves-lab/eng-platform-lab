import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RoleMapSchema, highestRole, roleFromGroups } from '@lab/contracts'
import { SignJWT } from 'jose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadRoleMap, roleOfClaims } from '../src/auth/token-verifier.js'
import { loadConfig } from '../src/config/config.js'
import { type TestIssuer, startTestIssuer } from './oidc-issuer.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const ROLES = fileURLToPath(new URL('../../../catalog/auth/roles.yaml', import.meta.url))
const DEV_GROUP = '0b7a3c1e-0000-4000-8000-00000000d001'
const LEAD_GROUP = '0b7a3c1e-0000-4000-8000-00000000d002'
const ADMIN_GROUP = '0b7a3c1e-0000-4000-8000-00000000d003'

const person = (groups: string[], extra: Record<string, unknown> = {}) => ({
  sub: 'subject-1',
  preferred_username: 'ana.lab@exemplo.invalid',
  name: 'Ana Lab',
  groups,
  ...extra,
})

describe('Entra ID validation against a local OIDC issuer', () => {
  let issuer: TestIssuer
  let app: INestApplication

  const me = (token: string) =>
    request(app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`)

  beforeAll(async () => {
    issuer = await startTestIssuer()
    const config = loadConfig({
      NODE_ENV: 'test',
      PORTAL_HANDBOOK_DIR: HANDBOOK,
      PORTAL_PANEL_DATA: '/nope/data.json',
      PORTAL_AUTH_MODE: 'entra',
      PORTAL_JWKS_URL: issuer.jwksUrl,
      PORTAL_JWT_ISSUER: issuer.issuer,
      PORTAL_JWT_AUDIENCE: issuer.audience,
      PORTAL_LEAD_LOGINS: 'lider.login@exemplo.invalid',
    })
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await issuer.close()
  })

  it('maps the groups of a valid token to the highest portal role', async () => {
    expect((await me(await issuer.sign(person([DEV_GROUP]))).expect(200)).body).toEqual({
      login: 'ana.lab@exemplo.invalid',
      name: 'Ana Lab',
      role: 'dev',
    })
    expect((await me(await issuer.sign(person([LEAD_GROUP]))).expect(200)).body.role).toBe('lead')
    const both = await issuer.sign(person([DEV_GROUP, ADMIN_GROUP.toUpperCase()]))
    expect((await me(both).expect(200)).body.role).toBe('admin')
  })

  it('keeps app roles and lead logins as extra sources of a role', async () => {
    const appRole = await issuer.sign(person([], { roles: ['portal.lead'] }))
    expect((await me(appRole).expect(200)).body.role).toBe('lead')
    const lead = await issuer.sign(
      person([DEV_GROUP], { preferred_username: 'lider.login@exemplo.invalid' }),
    )
    expect((await me(lead).expect(200)).body.role).toBe('lead')
  })

  it('answers 403 to a valid account without a mapped group', async () => {
    const response = await me(await issuer.sign(person(['grupo-sem-papel']))).expect(403)
    expect(response.body.message).toContain('no portal role')
    const overage = await issuer.sign(
      person([], { _claim_names: { groups: 'src1' }, roles: ['portal.admin'] }),
    )
    expect((await me(overage).expect(403)).body.message).toContain('too many groups')
  })

  it('answers 401 to expired, foreign or tampered tokens', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401)
    await me(await issuer.sign(person([DEV_GROUP]), { expiresIn: '-1m' })).expect(401)
    await me(await issuer.sign(person([DEV_GROUP]), { audience: 'api://outra-api' })).expect(401)
    await me(await issuer.sign(person([DEV_GROUP]), { issuer: 'https://outro.invalid' })).expect(
      401,
    )
    await me(await issuer.sign(person([DEV_GROUP]), { key: 'rogue' })).expect(401)
    const symmetric = await new SignJWT(person([ADMIN_GROUP]))
      .setProtectedHeader({ alg: 'HS256', kid: 'lab-key-1' })
      .setIssuer(issuer.issuer)
      .setAudience(issuer.audience)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('a'.repeat(32)))
    await me(symmetric).expect(401)
    await me(await issuer.sign({ name: 'Sem sujeito', groups: [DEV_GROUP] })).expect(401)
  })

  it('keeps admin-only routes closed to other roles and open to admins', async () => {
    const dev = await issuer.sign(person([DEV_GROUP]))
    const admin = await issuer.sign(person([ADMIN_GROUP]))
    const server = app.getHttpServer()
    await request(server).get('/api/audit').set('Authorization', `Bearer ${dev}`).expect(403)
    const open = await request(server).get('/api/audit').set('Authorization', `Bearer ${admin}`)
    expect(open.status).toBe(503)
  })
})

describe('role map', () => {
  it('loads the versioned map and rejects duplicated or unknown entries', async () => {
    const map = await loadRoleMap(ROLES)
    expect(map.defaultRole).toBeNull()
    expect(map.groups.map((group) => group.role)).toEqual(['dev', 'lead', 'admin'])

    const dir = await mkdtemp(join(tmpdir(), 'roles-'))
    const duplicated = join(dir, 'roles.yaml')
    await writeFile(
      duplicated,
      'defaultRole: dev\ngroups:\n  - { id: g1, name: A, role: dev }\n  - { id: G1, name: B, role: lead }\n',
    )
    await expect(loadRoleMap(duplicated)).rejects.toThrow('duplicated group G1')
    const unknown = join(dir, 'unknown.yaml')
    await writeFile(unknown, 'defaultRole: dev\ngroups:\n  - { id: g1, name: A, role: root }\n')
    await expect(loadRoleMap(unknown)).rejects.toThrow('Invalid role map')
  })

  it('falls back to the default role only when no group matches', () => {
    const map = RoleMapSchema.parse({
      defaultRole: 'dev',
      groups: [{ id: 'g-lead', name: 'Líderes', role: 'lead' }],
    })
    expect(roleFromGroups(map, [])).toBe('dev')
    expect(roleFromGroups(map, ['G-LEAD'])).toBe('lead')
    expect(highestRole([])).toBeNull()
    expect(roleOfClaims({ groups: 'g-lead' }, 'x', map, [])).toBe('dev')
    expect(() => roleOfClaims({}, 'x', { ...map, defaultRole: null }, [])).toThrow('no portal role')
  })

  it('needs the role map and https JWKS in production', () => {
    const base = {
      PORTAL_HANDBOOK_DIR: HANDBOOK,
      PORTAL_PANEL_DATA: 'x.json',
      PORTAL_AUTH_MODE: 'entra',
      PORTAL_JWT_ISSUER: 'issuer',
      PORTAL_JWT_AUDIENCE: 'audience',
    }
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', PORTAL_JWKS_URL: 'http://idp.invalid/keys' }),
    ).toThrow('PORTAL_JWKS_URL must use https in production')
    const config = loadConfig({ ...base, PORTAL_JWKS_URL: 'https://idp.invalid/keys' })
    expect(config.auth).toMatchObject({ mode: 'entra', rolesFile: ROLES })
    expect(loadConfig({ ...base, PORTAL_AUTH_MODE: 'dev', PORTAL_DEV_ROLE: 'admin' }).auth).toEqual(
      { mode: 'dev', devUser: 'dev.local', devRole: 'admin' },
    )
    const dev = { ...base, PORTAL_AUTH_MODE: 'dev' }
    expect(loadConfig({ ...dev, PORTAL_TRUST_PROXY: '2' }).trustProxy).toBe(2)
    expect(loadConfig({ ...dev, PORTAL_TRUST_PROXY: 'false' }).trustProxy).toBe(false)
    expect(loadConfig({ ...dev, PORTAL_TRUST_PROXY: 'true' }).trustProxy).toBe(true)
    expect(loadConfig(dev).trustProxy).toBe('loopback')
  })
})
