import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { ReadinessResponseSchema } from '@lab/contracts'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { type PortalConfig, loadConfig } from '../src/config/config.js'
import { DATABASE_PROBE, type DatabaseProbe } from '../src/health/database-probe.js'
import { LOG_WRITER } from '../src/observability/logger.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

const panelFile = async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'portal-obs-')), 'data.json')
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-11-20T12:00:00.000Z', datasets: [] }),
  )
  return path
}

const baseEnv = async () => ({
  NODE_ENV: 'test',
  PORTAL_HANDBOOK_DIR: HANDBOOK,
  PORTAL_PANEL_DATA: await panelFile(),
})

const start = async (config: PortalConfig, probe?: DatabaseProbe) => {
  const lines: string[] = []
  const builder = Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(LOG_WRITER)
    .useValue((line: string) => lines.push(line))
  if (probe) builder.overrideProvider(DATABASE_PROBE).useValue(probe)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  const logs = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>)
  return { app, logs }
}

describe('request logs', () => {
  let app: INestApplication
  let logs: () => Record<string, unknown>[]

  beforeAll(async () => {
    ;({ app, logs } = await start(loadConfig(await baseEnv())))
  })
  afterAll(() => app.close())

  it('echoes a well-formed request id and logs the route template with the trace id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/handbook/standards/P-999?term=ana@exemplo.com')
      .set('x-request-id', 'edge-req-0001')
      .set('traceparent', TRACEPARENT)
      .expect(404)

    expect(response.headers['x-request-id']).toBe('edge-req-0001')
    const line = logs().find((entry) => entry['requestId'] === 'edge-req-0001')
    expect(line).toMatchObject({
      level: 'warn',
      msg: 'http.request',
      service: 'portal-api',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      method: 'GET',
      route: '/api/handbook/standards/:id',
      status: 404,
    })
    expect(typeof line?.['durationMs']).toBe('number')
    expect(JSON.stringify(logs())).not.toMatch(/ana@exemplo|P-999|term=/)
  })

  it('replaces a malformed request id and never logs the raw path of unmatched routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/nada/12345678901')
      .set('x-request-id', 'bad id!')
      .expect(404)

    const requestId = response.headers['x-request-id']
    expect(requestId).toMatch(/^[\da-f-]{36}$/)
    const line = logs().find((entry) => entry['requestId'] === requestId)
    expect(line).toMatchObject({ route: null, status: 404 })
    expect(line).not.toHaveProperty('traceId')
    expect(JSON.stringify(line)).not.toContain('12345678901')
  })

  it('keeps successful health probes out of the access log', async () => {
    const before = logs().length
    const response = await request(app.getHttpServer()).get('/health').expect(200)
    await request(app.getHttpServer()).get('/health/ready').expect(200)
    expect(response.headers['x-request-id']).toBeDefined()
    expect(logs()).toHaveLength(before)
  })

  it('logs successful requests at info level', async () => {
    await request(app.getHttpServer()).get('/api/handbook/overview').expect(200)
    expect(logs().at(-1)).toMatchObject({
      level: 'info',
      route: '/api/handbook/overview',
      status: 200,
    })
  })
})

describe('GET /health/ready', () => {
  it('is ready without a database, with the handbook loaded, in retrieval mode', async () => {
    const { app } = await start(loadConfig(await baseEnv()))
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200)
    expect(ReadinessResponseSchema.parse(response.body)).toEqual({
      status: 'ready',
      checks: {
        database: { status: 'skipped', detail: 'not_configured' },
        handbook: { status: 'ok' },
        model: { status: 'ok', mode: 'retrieval' },
      },
    })
    await app.close()
  })

  it('reports model mode without exposing the gateway or its key', async () => {
    const { app } = await start(
      loadConfig({
        ...(await baseEnv()),
        PORTAL_LLM_BASE_URL: 'https://gateway.example.invalid/v1',
        PORTAL_LLM_API_KEY: 'sk-test-secret',
        PORTAL_LLM_MODEL: 'modelo-lab',
      }),
    )
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200)
    expect(response.body.checks.model).toEqual({ status: 'ok', mode: 'llm' })
    expect(JSON.stringify(response.body)).not.toMatch(/gateway|sk-test|modelo-lab/)
    await app.close()
  })

  it('answers 503 when the database check fails', async () => {
    let closed = false
    const { app, logs } = await start(loadConfig(await baseEnv()), {
      check: () => Promise.resolve({ status: 'failed', detail: 'unreachable' }),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    })
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503)
    expect(response.body).toMatchObject({
      status: 'not_ready',
      checks: { database: { status: 'failed', detail: 'unreachable' } },
    })
    expect(logs().at(-1)).toMatchObject({ level: 'error', route: '/health/ready', status: 503 })
    await app.close()
    expect(closed).toBe(true)
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('GET /health/ready with Postgres', () => {
  it('checks the database with SELECT 1', async () => {
    const { app } = await start(
      loadConfig({ NODE_ENV: 'test', PORTAL_HANDBOOK_DIR: HANDBOOK, DATABASE_URL: databaseUrl }),
    )
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200)
    expect(response.body.checks.database).toEqual({ status: 'ok' })
    await app.close()
  })
})
