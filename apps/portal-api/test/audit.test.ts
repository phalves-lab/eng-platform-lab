import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AuditPageSchema } from '@lab/contracts'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { linkReleaseRun, withAuditScope } from '../src/audit/audit-context.js'
import { AUDIT_STORE, type AuditStore } from '../src/audit/audit-store.js'
import { AuditService } from '../src/audit/audit.service.js'
import { type AuditedRequest, classifyRequest } from '../src/audit/classify.js'
import { truncateIp } from '../src/audit/ip.js'
import { loadConfig } from '../src/config/config.js'
import { MemoryAuditStore } from './memory-audit-store.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))

const req = (overrides: Partial<AuditedRequest>): AuditedRequest => ({
  method: 'GET',
  route: '/api/handbook/overview',
  params: {},
  query: {},
  body: undefined,
  login: 'ana',
  ...overrides,
})

describe('audit classification', () => {
  it('records every write method, whatever the route', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(classifyRequest(req({ method, route: '/api/qualquer' }))).toMatchObject({
        action: `${method} /api/qualquer`,
        kind: 'write',
      })
    }
    expect(classifyRequest(req({ method: 'get' }))).toBeNull()
    expect(classifyRequest(req({ method: 'HEAD' }))).toBeNull()
  })

  it('records reads of team data, of other people queues and of the trail', () => {
    expect(classifyRequest(req({ route: '/api/team/work', query: { team: 'Campanhas' } }))).toEqual(
      { action: 'GET /api/team/work', kind: 'read', target: 'team=Campanhas' },
    )
    expect(classifyRequest(req({ route: '/api/team' }))?.kind).toBe('read')
    expect(classifyRequest(req({ route: '/api/audit' }))?.kind).toBe('read')
    expect(classifyRequest(req({ route: '/api/me/review', query: { login: 'bruno' } }))).toEqual({
      action: 'GET /api/me/review',
      kind: 'read',
      target: 'login=bruno',
    })
    expect(classifyRequest(req({ route: '/api/me/review', query: { login: 'ana' } }))).toBeNull()
    expect(classifyRequest(req({ route: '/api/me/review' }))).toBeNull()
    expect(classifyRequest(req({ route: '/api/teams' }))).toBeNull()
  })

  it('takes the target from route params first, then from known fields, never free text', () => {
    expect(
      classifyRequest(
        req({ method: 'DELETE', route: '/api/conversations/:id', params: { id: 'c-1' } }),
      )?.target,
    ).toBe('id=c-1')
    expect(
      classifyRequest(
        req({
          method: 'POST',
          route: '/api/ask/stream',
          body: { question: 'dado pessoal aqui', conversationId: 'c-2' },
        }),
      )?.target,
    ).toBe('conversationId=c-2')
    expect(
      classifyRequest(req({ method: 'POST', route: '/api/ask', body: { question: 'texto' } }))
        ?.target,
    ).toBeNull()
    expect(
      classifyRequest(req({ method: 'POST', route: '/x', body: ['project'] }))?.target,
    ).toBeNull()
    expect(
      classifyRequest(req({ method: 'POST', route: '/x', body: { project: 'p'.repeat(300) } }))
        ?.target,
    ).toHaveLength(200)
  })

  it('keeps only the network part of the client address', () => {
    expect(truncateIp('203.0.113.77')).toBe('203.0.113.0')
    expect(truncateIp('::ffff:198.51.100.9')).toBe('198.51.100.0')
    expect(truncateIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::')
    expect(truncateIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8:0::')
    expect(truncateIp('::1')).toBe('0:0:0::')
    expect(truncateIp('fe80::1%en0')).toBe('fe80:0:0::')
    expect(truncateIp('não é ip')).toBeNull()
    expect(truncateIp(undefined)).toBeNull()
  })

  it('links a release run only inside a request scope', () => {
    linkReleaseRun(9)
    expect(withAuditScope((scope) => (linkReleaseRun(7), scope.releaseRunId))).toBe(7)
  })
})

describe('audit trail over HTTP', () => {
  let app: INestApplication
  let store: MemoryAuditStore

  const start = async (env: Record<string, string>, auditStore: AuditStore | null) => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORTAL_HANDBOOK_DIR: HANDBOOK,
      PORTAL_PANEL_DATA: '/nope/data.json',
      ...env,
    })
    const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(AUDIT_STORE)
      .useValue(auditStore)
      .compile()
    const instance = module.createNestApplication()
    await instance.init()
    return instance
  }

  beforeAll(async () => {
    store = new MemoryAuditStore()
    app = await start({ PORTAL_DEV_USER: 'admin.lab', PORTAL_DEV_ROLE: 'admin' }, store)
  })
  afterAll(() => app.close())

  it('records writes with outcome and truncated address, and skips ordinary reads', async () => {
    const server = app.getHttpServer()
    await request(server).get('/api/handbook/overview').expect(200)
    await request(server).post('/api/ask').send({ question: 'o que diz o ENG-QA-01?' }).expect(200)
    await request(server).post('/api/ask').send({ question: 'a' }).expect(400)
    await request(server)
      .delete('/api/conversations/6f1c2a8e-0000-4000-8000-000000000001')
      .expect(503)

    expect(store.events.map(({ action, outcome, status }) => [action, outcome, status])).toEqual([
      ['POST /api/ask', 'success', 200],
      ['POST /api/ask', 'failed', 400],
      ['DELETE /api/conversations/:id', 'failed', 503],
    ])
    expect(store.events[2]).toMatchObject({
      actor: 'admin.lab',
      role: 'admin',
      kind: 'write',
      target: 'id=6f1c2a8e-0000-4000-8000-000000000001',
      ipPrefix: '127.0.0.0',
      releaseRunId: null,
    })
  })

  it('serves the trail to admins with filters and pages, recording the read', async () => {
    const server = app.getHttpServer()
    const before = store.events.length
    await request(server).get('/api/me/review?login=bruno').expect(503)
    const page = await request(server).get('/api/audit?kind=write&limit=2').expect(200)
    const body = AuditPageSchema.parse(page.body)
    expect(body.entries.map((entry) => entry.status)).toEqual([503, 400])
    expect(body.nextBefore).toBe(body.entries[1]?.id)
    const next = await request(server).get(`/api/audit?kind=write&before=${body.nextBefore}`)
    expect(next.body).toMatchObject({ entries: [{ status: 200 }], nextBefore: null })
    await request(server).get('/api/audit?from=2026-11-22&to=2026-11-01').expect(400)
    await request(server).get('/api/audit?kind=apagar').expect(400)

    expect(store.events.slice(before).map((event) => [event.action, event.status])).toEqual([
      ['GET /api/me/review', 503],
      ['GET /api/audit', 200],
      ['GET /api/audit', 200],
      ['GET /api/audit', 400],
      ['GET /api/audit', 400],
    ])
    expect(store.events.slice(before).every((event) => event.kind === 'read')).toBe(true)
  })

  it('closes the trail to other roles and records the denial', async () => {
    const own = new MemoryAuditStore()
    const devApp = await start({ PORTAL_DEV_USER: 'ana.dev' }, own)
    const response = await request(devApp.getHttpServer()).get('/api/audit').expect(403)
    expect(response.body.message).toContain('Only admins')
    expect(own.events).toMatchObject([
      { actor: 'ana.dev', role: 'dev', action: 'GET /api/audit', outcome: 'denied', status: 403 },
    ])
    await devApp.close()
  })

  it('answers 503 without a database and keeps serving the rest', async () => {
    const bare = await start({ PORTAL_DEV_USER: 'admin.lab', PORTAL_DEV_ROLE: 'admin' }, null)
    await request(bare.getHttpServer()).get('/api/audit').expect(503)
    await request(bare.getHttpServer()).post('/api/ask').send({ question: 'ENG-QA-01' }).expect(200)
    await bare.close()
  })

  it('does not fail the request when the trail cannot be written', async () => {
    const broken: AuditStore = {
      record: () => Promise.reject(new Error('disco cheio')),
      list: () => Promise.resolve([]),
    }
    const flaky = await start({ PORTAL_DEV_USER: 'ana.dev' }, broken)
    const response = await request(flaky.getHttpServer())
      .post('/api/ask')
      .send({ question: 'ENG-QA-01' })
    expect(response.status).toBe(200)
    await flaky.close()
  })

  it('asks the store for one extra row to know whether there is a next page', async () => {
    const calls: unknown[] = []
    const service = new AuditService({
      record: () => Promise.reject(new Error('unused')),
      list: (filter) => {
        calls.push(filter)
        return Promise.resolve([])
      },
    })
    expect(
      await service.list({
        limit: 10,
        actor: 'ana',
        action: 'releases',
        outcome: 'denied',
        from: '2026-11-01',
        to: '2026-11-21',
      }),
    ).toEqual({ entries: [], nextBefore: null })
    expect(calls[0]).toEqual({
      actor: 'ana',
      action: 'releases',
      outcome: 'denied',
      fromDate: '2026-11-01',
      toDate: '2026-11-21',
      timeZone: 'America/Sao_Paulo',
      limit: 11,
    })
  })
})
