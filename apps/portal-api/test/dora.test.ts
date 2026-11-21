import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { DoraMetricsResponseSchema, DoraQuerySchema } from '@lab/contracts'
import type { Pool } from '@lab/database'
import { loadDoraCatalog } from '@lab/dora'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'
import { DatabaseDoraSource, FixtureDoraSource } from '../src/dora/dora-source.js'
import { DoraService } from '../src/dora/dora.service.js'

const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const HANDBOOK = repoPath('handbook')
const NOW = new Date('2026-11-21T12:00:00.000Z')

const labService = async () =>
  new DoraService(
    await loadDoraCatalog(repoPath('catalog/dora/repos.yaml')),
    new FixtureDoraSource(repoPath('fixtures/dora'), repoPath('catalog/incidents')),
  )

describe('DORA endpoint on the lab fixtures', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        AppModule.register(
          loadConfig({
            NODE_ENV: 'test',
            PORTAL_HANDBOOK_DIR: HANDBOOK,
            PORTAL_PANEL_DATA: '/nope/data.json',
          }),
        ),
      ],
    }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(() => app.close())

  it('answers the contract with every catalog repository and team', async () => {
    const response = await request(app.getHttpServer()).get('/api/metrics/dora').expect(200)
    const body = DoraMetricsResponseSchema.parse(response.body)
    expect(body.window.weeks).toBe(12)
    expect(body.trend).toHaveLength(12)
    expect(body.repos.map((entry) => entry.repo)).toEqual([
      'lab-demo/campanhas-api',
      'lab-demo/campanhas-web',
      'lab-demo/notificacoes-worker',
      'phalves-lab/eng-platform-lab',
    ])
    expect(body.teams.map((team) => team.team)).toEqual(['Campanhas', 'Mensageria', 'Plataforma'])
  })

  it('filters by team or repository and validates the query', async () => {
    const server = app.getHttpServer()
    const team = await request(server).get('/api/metrics/dora?team=Mensageria&weeks=8').expect(200)
    expect(team.body.filter).toEqual({ team: 'Mensageria', repo: null })
    expect(team.body.trend).toHaveLength(8)
    const repo = await request(server)
      .get('/api/metrics/dora?repo=lab-demo/campanhas-web')
      .expect(200)
    expect(repo.body.filter).toEqual({ team: null, repo: 'lab-demo/campanhas-web' })
    await request(server).get('/api/metrics/dora?team=Ninguem').expect(404)
    await request(server).get('/api/metrics/dora?weeks=40').expect(400)
    await request(server)
      .get('/api/metrics/dora?team=Campanhas&repo=lab-demo/campanhas-web')
      .expect(400)
  })
})

describe('DoraService', () => {
  it('ranks the fictitious repositories with the versioned incidents', async () => {
    const service = await labService()
    const result = await service.metrics(DoraQuerySchema.parse({}), NOW)
    const api = result.repos.find((entry) => entry.repo === 'lab-demo/campanhas-api')
    expect(api?.summary.changeFailureRate).toMatchObject({ failed: 2, band: 'elite' })
    expect(result.incidents.map((incident) => incident.id)).toContain('INC-2026-014')
    expect(result.deploys[0]?.deployedAt.startsWith('2026-11-20')).toBe(true)
  })

  it('asks the source only for the window it needs', async () => {
    const windows: unknown[] = []
    const service = new DoraService(await loadDoraCatalog(repoPath('catalog/dora/repos.yaml')), {
      load: (window) => {
        windows.push(window)
        return Promise.resolve({ deploys: [], changes: [], incidents: [] })
      },
    })
    await service.metrics(DoraQuerySchema.parse({ weeks: 4 }), NOW)
    expect(windows).toEqual([
      {
        deploysSince: '2026-10-26T00:00:00.000Z',
        changesSince: '2026-07-28T00:00:00.000Z',
        incidentsSince: '2026-10-26T00:00:00.000Z',
      },
    ])
  })

  it('fails to boot with a broken catalog', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dora-'))
    await writeFile(join(directory, 'repos.yaml'), 'repos: []')
    const module = Test.createTestingModule({
      imports: [
        AppModule.register(
          loadConfig({
            NODE_ENV: 'test',
            PORTAL_HANDBOOK_DIR: HANDBOOK,
            PORTAL_PANEL_DATA: '/nope/data.json',
            PORTAL_DORA_CATALOG: join(directory, 'repos.yaml'),
          }),
        ),
      ],
    })
    await expect(module.compile()).rejects.toThrow('repos.yaml inválido')
  })
})

describe('DatabaseDoraSource', () => {
  const failingPool = (code: string) =>
    ({
      query: () => Promise.reject(Object.assign(new Error('boom'), { code })),
      end: () => Promise.resolve(),
    }) as unknown as Pool

  const window = {
    deploysSince: '2026-10-26T00:00:00.000Z',
    changesSince: '2026-07-28T00:00:00.000Z',
    incidentsSince: '2026-10-26T00:00:00.000Z',
  }

  it('answers 503 while the worker has not created the tables', async () => {
    const source = new DatabaseDoraSource(failingPool('42P01'))
    await expect(source.load(window)).rejects.toMatchObject({ status: 503 })
    await source.onModuleDestroy()
  })

  it('lets other database errors through', async () => {
    await expect(new DatabaseDoraSource(failingPool('08006')).load(window)).rejects.toThrow('boom')
  })
})
