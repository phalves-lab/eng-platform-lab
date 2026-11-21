import 'reflect-metadata'
import { mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { ReviewMetricsResponseSchema } from '@lab/contracts'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { TOKEN_VERIFIER } from '../src/auth/token-verifier.js'
import { type PortalConfig, loadConfig } from '../src/config/config.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))

const row = (overrides: Record<string, unknown>) => ({
  position: 1,
  number: 1,
  title: 'feat: LAB-1',
  url: 'https://example.invalid/pr/1',
  author: 'ana',
  taskKey: 'LAB-1',
  taskStatus: 'Code Review',
  requestedReviewers: [],
  reviewedBy: [],
  enteredAt: '2026-11-20T10:00:00.000Z',
  enteredFrom: 'pr',
  ageBusinessDays: 0.5,
  level: 'ok',
  hasHumanReview: false,
  checks: 'SUCCESS',
  botSignal: 'pronto',
  risks: [],
  lines: 10,
  ...overrides,
})

const writePanelData = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-'))
  const path = join(dir, 'data.json')
  const dataset = {
    id: 'lab',
    title: 'Laboratório',
    label: 'Lab',
    generatedAt: '2026-11-20T12:00:00.000Z',
    queue: [
      row({ number: 1, author: 'ana', requestedReviewers: ['dev.local'] }),
      row({ number: 2, author: 'dev.local', checks: 'FAILURE' }),
      row({ number: 3, author: 'dev.local', botSignal: 'ajustes' }),
      row({ number: 4, author: 'dev.local', requestedReviewers: ['ana'], level: 'atencao' }),
      row({ number: 5, author: 'dev.local', hasHumanReview: true }),
      row({ number: 6, author: 'dev.local' }),
      row({ number: 7, author: 'bruno', reviewedBy: ['dev.local'] }),
    ],
    alerts: [],
    metrics: {},
    trend: [],
  }
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, generatedAt: dataset.generatedAt, datasets: [dataset] }),
  )
  return path
}

const start = async (
  config: PortalConfig,
  verifier?: { verify: (t: string) => Promise<unknown> },
) => {
  const builder = Test.createTestingModule({ imports: [AppModule.register(config)] })
  if (verifier) builder.overrideProvider(TOKEN_VERIFIER).useValue(verifier)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return app
}

describe('portal-api in dev auth mode', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start(
      loadConfig({
        NODE_ENV: 'test',
        PORTAL_HANDBOOK_DIR: HANDBOOK,
        PORTAL_PANEL_DATA: await writePanelData(),
        PORTAL_LEAD_LOGINS: 'lead.user',
      }),
    )
  })
  afterAll(() => app.close())

  it('serves health without a user and identifies the dev user', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' })
    const me = await request(app.getHttpServer()).get('/api/me').expect(200)
    expect(me.body).toEqual({ login: 'dev.local', name: 'dev.local', role: 'dev' })
  })

  it('serves handbook overview, rules, standards and filters', async () => {
    const server = app.getHttpServer()
    const overview = await request(server).get('/api/handbook/overview').expect(200)
    expect(overview.body.standards.VIGENTE).toBeGreaterThan(0)
    expect((await request(server).get('/api/handbook/rules').expect(200)).body.rules).toContain(
      'ENG-SEC-01',
    )
    const lacunas = await request(server).get('/api/handbook/standards?status=LACUNA').expect(200)
    expect(lacunas.body).toEqual([expect.objectContaining({ id: 'ENG-PR-03', status: 'LACUNA' })])
    await request(server).get('/api/handbook/standards?status=WRONG').expect(400)
    const standard = await request(server).get('/api/handbook/standards/eng-qa-01').expect(200)
    expect(standard.body.fields.Regra).toContain('70%')
    await request(server).get('/api/handbook/standards/NOPE-1').expect(404)
  })

  it('serves systems, glossary, decisions and search', async () => {
    const server = app.getHttpServer()
    const systems = await request(server).get('/api/handbook/systems').expect(200)
    const slug = systems.body.find((s: { name: string }) => s.name === 'Bot de review').slug
    expect(
      (await request(server).get(`/api/handbook/systems/${slug}`).expect(200)).body.layer,
    ).toBe('Ferramentas')
    await request(server).get('/api/handbook/systems/kafka').expect(404)
    expect(
      (await request(server).get('/api/handbook/systems?term=postgres').expect(200)).body,
    ).toHaveLength(1)
    expect(
      (await request(server).get('/api/handbook/glossary?term=golden set').expect(200)).body,
    ).toHaveLength(1)
    expect(
      (await request(server).get('/api/handbook/glossary').expect(200)).body.length,
    ).toBeGreaterThan(1)
    expect(
      (await request(server).get('/api/handbook/decisions?priority=1').expect(200)).body,
    ).toHaveLength(1)
    expect((await request(server).get('/api/handbook/decisions').expect(200)).body).toHaveLength(2)
    const hits = await request(server).get('/api/handbook/search?q=cobertura%20teste').expect(200)
    expect(hits.body[0].source).toContain('ENG-QA-01')
    await request(server).get('/api/handbook/search?q=a').expect(400)
  })

  it('answers questions from the handbook with sources and validates input', async () => {
    const server = app.getHttpServer()
    const byId = await request(server)
      .post('/api/ask')
      .send({ question: 'o que diz o ENG-QA-01?' })
      .expect(200)
    expect(byId.body.mode).toBe('retrieval')
    expect(byId.body.sources[0]).toMatchObject({
      score: 100,
      snippet: expect.stringContaining('70%'),
    })
    const none = await request(server)
      .post('/api/ask')
      .send({ question: 'xyzxyz qwqwqw' })
      .expect(200)
    expect(none.body).toMatchObject({
      sources: [],
      answer: expect.stringContaining('Não encontrei'),
    })
    await request(server).post('/api/ask').send({ question: 'a' }).expect(400)
  })

  it('builds my review queue and lists datasets', async () => {
    const server = app.getHttpServer()
    expect((await request(server).get('/api/review/datasets').expect(200)).body).toEqual([
      expect.objectContaining({ id: 'lab' }),
    ])
    await request(server).get('/api/review/datasets/nope').expect(404)
    expect(
      (await request(server).get('/api/review/datasets/lab').expect(200)).body.queue,
    ).toHaveLength(7)
    const mine = await request(server).get('/api/me/review?login=ana').expect(200)
    expect(mine.body.toReview.map((r: { number: number }) => r.number)).toEqual([1])
    expect(mine.body.reviewed.map((r: { number: number }) => r.number)).toEqual([7])
    expect(mine.body.mine.map((m: { status: { label: string } }) => m.status.label)).toEqual([
      'Check vermelho',
      'Bot pediu ajustes',
      'Aguardando review',
      'Com review',
      'Sem revisor',
    ])
    expect(mine.body.mine[2].status.tone).toBe('warning')
    expect(mine.body.actions).toBe(5)
  })
})

describe('portal-api with missing data and entra auth', () => {
  it('returns 503 when the delivery data is missing', async () => {
    const app = await start(
      loadConfig({
        NODE_ENV: 'test',
        PORTAL_HANDBOOK_DIR: HANDBOOK,
        PORTAL_PANEL_DATA: '/nope/data.json',
      }),
    )
    await request(app.getHttpServer()).get('/api/review/datasets').expect(503)
    await app.close()
  })

  it('requires a valid bearer token and lets leads look at other queues', async () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORTAL_HANDBOOK_DIR: HANDBOOK,
      PORTAL_PANEL_DATA: await writePanelData(),
      PORTAL_AUTH_MODE: 'entra',
      PORTAL_JWKS_URL: 'https://login.example.invalid/keys',
      PORTAL_JWT_ISSUER: 'issuer',
      PORTAL_JWT_AUDIENCE: 'audience',
    })
    const app = await start(config, {
      verify: (token) =>
        token === 'lead-token'
          ? Promise.resolve({ login: 'lead.user', name: 'Lead', role: 'lead' })
          : Promise.reject(new Error('bad')),
    })
    const server = app.getHttpServer()
    await request(server).get('/api/me').expect(401)
    await request(server).get('/api/me').set('Authorization', 'Bearer wrong').expect(401)
    const me = await request(server)
      .get('/api/me')
      .set('Authorization', 'Bearer lead-token')
      .expect(200)
    expect(me.body.role).toBe('lead')
    const other = await request(server)
      .get('/api/me/review?login=ana')
      .set('Authorization', 'Bearer lead-token')
      .expect(200)
    expect(other.body.toReview.map((r: { number: number }) => r.number)).toEqual([4])
    await app.close()
  })
})

describe('configuration', () => {
  it('fails fast on unsafe or incomplete settings', () => {
    const base = { PORTAL_HANDBOOK_DIR: HANDBOOK, PORTAL_PANEL_DATA: 'x.json' }
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(
      'not allowed in production',
    )
    expect(() => loadConfig({ ...base, PORTAL_AUTH_MODE: 'entra' })).toThrow('entra mode requires')
    expect(() => loadConfig({})).toThrow('Invalid portal configuration')
    expect(loadConfig({ ...base, PORTAL_LEAD_LOGINS: 'a, b ,' }).leadLogins).toEqual(['a', 'b'])
  })

  it('reads review data from the database when DATABASE_URL is set, else from the file', () => {
    const handbook = { PORTAL_HANDBOOK_DIR: HANDBOOK }
    expect(loadConfig({ ...handbook, PORTAL_PANEL_DATA: 'x.json' }).panelSource).toMatchObject({
      kind: 'file',
    })
    expect(
      loadConfig({
        ...handbook,
        PORTAL_PANEL_DATA: 'x.json',
        DATABASE_URL: 'postgres://lab:lab@localhost:5433/lab',
      }).panelSource,
    ).toEqual({ kind: 'database', url: 'postgres://lab:lab@localhost:5433/lab' })
    expect(() => loadConfig(handbook)).toThrow('set DATABASE_URL or PORTAL_PANEL_DATA')
    expect(() => loadConfig({ ...handbook, DATABASE_URL: 'mysql://x' })).toThrow('postgres:// URL')
  })
})

describe('review metrics endpoint', () => {
  const metrics = (merged: number) => ({
    windowDays: 30,
    merged,
    medianHoursToFirstReview: 12.5,
    medianBusinessDaysToMerge: 1.8,
    medianSize: 240,
    mergedWithFailingChecks: 1,
    signals: { ajustes: 1, gate: 2, pronto: 3, sem_comentario: 1 },
    reviewers: [{ reviewer: 'bruno', reviews: 4, pullRequests: 3, comments: 9 }],
    pairs: [{ author: 'ana', reviewer: 'bruno', count: 2 }],
  })
  const deliveryData = (merged: number) => ({
    schemaVersion: 1,
    generatedAt: '2026-11-20T12:00:00.000Z',
    datasets: [
      {
        id: 'demo',
        title: 'Exemplo com time de 8',
        label: 'Demo',
        generatedAt: '2026-11-20T12:00:00.000Z',
        queue: [],
        alerts: [
          {
            kind: 'Review parado',
            severity: 'alta',
            subject: '#9',
            message: 'PR #9 aguarda a primeira review.',
            url: 'https://example.invalid/pr/9',
          },
        ],
        metrics: metrics(merged),
        trend: [
          {
            weekStart: '2026-11-09T00:00:00.000Z',
            merged: 0,
            medianHoursToFirstReview: null,
            medianSize: null,
          },
          {
            weekStart: '2026-11-16T00:00:00.000Z',
            merged,
            medianHoursToFirstReview: 12.5,
            medianSize: 240,
          },
        ],
      },
    ],
  })

  let app: INestApplication
  let path: string

  beforeAll(async () => {
    path = join(await mkdtemp(join(tmpdir(), 'portal-metrics-')), 'data.json')
    await writeFile(path, JSON.stringify(deliveryData(5)))
    app = await start(
      loadConfig({ NODE_ENV: 'test', PORTAL_HANDBOOK_DIR: HANDBOOK, PORTAL_PANEL_DATA: path }),
    )
  })
  afterAll(() => app.close())

  it('serves metrics, trend and alerts of a dataset in the shared contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/metrics/review?dataset=demo')
      .expect(200)
    const body = ReviewMetricsResponseSchema.parse(response.body)
    expect(body).toMatchObject({ dataset: 'demo', title: 'Exemplo com time de 8' })
    expect(body.metrics.merged).toBe(5)
    expect(body.trend[0]?.medianHoursToFirstReview).toBeNull()
    expect(body.alerts[0]?.url).toBe('https://example.invalid/pr/9')
    expect(response.body).not.toHaveProperty('queue')
  })

  it('validates the dataset and answers 404 for one missing from the file', async () => {
    const server = app.getHttpServer()
    await request(server).get('/api/metrics/review?dataset=prod').expect(400)
    await request(server).get('/api/metrics/review').expect(404)
    await request(server).get('/api/metrics/review?dataset=lab').expect(404)
  })

  it('reloads the file only when its modification time changes', async () => {
    const server = app.getHttpServer()
    const merged = async () =>
      (await request(server).get('/api/metrics/review?dataset=demo').expect(200)).body.metrics
        .merged
    const fixed = new Date('2026-11-20T12:00:00.000Z')
    await utimes(path, fixed, fixed)
    expect(await merged()).toBe(5)
    await writeFile(path, JSON.stringify(deliveryData(9)))
    await utimes(path, fixed, fixed)
    expect(await merged()).toBe(5)
    const later = new Date(fixed.getTime() + 60_000)
    await utimes(path, later, later)
    expect(await merged()).toBe(9)
  })

  it('returns 503 when the delivery data was not generated', async () => {
    const empty = await start(
      loadConfig({
        NODE_ENV: 'test',
        PORTAL_HANDBOOK_DIR: HANDBOOK,
        PORTAL_PANEL_DATA: '/nope/data.json',
      }),
    )
    await request(empty.getHttpServer()).get('/api/metrics/review?dataset=demo').expect(503)
    await empty.close()
  })
})
