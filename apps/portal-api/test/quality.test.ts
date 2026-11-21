import 'reflect-metadata'
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import {
  type RepoScorecard,
  ScorecardPolicySchema,
  type ScorecardReport,
  ScorecardResponseSchema,
  DocsReportSchema,
} from '@lab/contracts'
import { findStandard, loadHandbook } from '@lab/handbook'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'
import { CLOCK } from '../src/quality/clock.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const NOW = new Date('2026-11-21T12:00:00.000Z')

const repo = (overrides: Partial<RepoScorecard>): RepoScorecard => ({
  id: 'pedidos-api',
  repo: 'lab-ficticio/pedidos-api',
  name: 'API de pedidos',
  team: 'Vendas',
  description: null,
  url: null,
  source: 'fixture',
  score: 90,
  level: 'good',
  error: null,
  checks: [
    {
      id: 'coverage',
      title: 'Cobertura publicada',
      weight: 10,
      standardId: 'ENG-QA-01',
      status: 'pass',
      score: 100,
      detail: 'ok',
      fix: null,
    },
    {
      id: 'node-version',
      title: 'Versão do Node',
      weight: 5,
      standardId: 'NOPE-01',
      status: 'fail',
      score: 0,
      detail: 'Node 18',
      fix: 'Atualize',
    },
  ],
  ...overrides,
})

const report: ScorecardReport = {
  schemaVersion: 1,
  generatedAt: '2026-11-21T10:00:00.000Z',
  repos: [
    repo({}),
    repo({
      id: 'vitrine-web',
      repo: 'lab-ficticio/vitrine-web',
      name: 'Vitrine',
      score: 41,
      level: 'critical',
    }),
    repo({
      id: 'sem-acesso',
      repo: 'o/sem-acesso',
      team: 'Dados',
      score: null,
      level: 'unknown',
      checks: [],
    }),
  ],
}

const start = async (env: Record<string, string>) => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: join(ROOT, 'handbook'),
    PORTAL_PANEL_DATA: '/nope/data.json',
    ...env,
  })
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => NOW)
    .compile()
  const app = module.createNestApplication({ logger: false })
  await app.init()
  return app
}

describe('scorecard na portal-api', () => {
  let app: INestApplication
  let path: string

  beforeAll(async () => {
    path = join(await mkdtemp(join(tmpdir(), 'scorecard-')), 'scorecard.json')
    await writeFile(path, JSON.stringify(report))
    app = await start({ PORTAL_SCORECARD_DATA: path })
  })
  afterAll(() => app.close())

  it('lista os repositórios com resumo por nível e o título do padrão de cada checagem', async () => {
    const response = await request(app.getHttpServer()).get('/api/quality/scorecard').expect(200)
    const body = ScorecardResponseSchema.parse(response.body)
    expect(body).toMatchObject({
      generatedAt: report.generatedAt,
      total: 3,
      averageScore: 66,
      levels: { good: 1, attention: 0, critical: 1, unknown: 1 },
    })
    expect(body.repos[0]?.checks.map((check) => check.standardTitle)).toEqual([
      'Cobertura do diff',
      null,
    ])
  })

  it('filtra por termo e nível e recusa nível desconhecido', async () => {
    const server = app.getHttpServer()
    const ids = async (query: string) =>
      (await request(server).get(`/api/quality/scorecard${query}`).expect(200)).body.repos.map(
        (item: { id: string }) => item.id,
      )
    expect(await ids('?term=vitrine')).toEqual(['vitrine-web'])
    expect(await ids('?term=dados')).toEqual(['sem-acesso'])
    expect(await ids('?level=critical')).toEqual(['vitrine-web'])
    expect(await ids('?term=vendas&level=good')).toEqual(['pedidos-api'])
    await request(server).get('/api/quality/scorecard?level=otimo').expect(400)
  })

  it('detalha um repositório e responde 404 para id fora do relatório', async () => {
    const server = app.getHttpServer()
    const detail = await request(server).get('/api/quality/scorecard/vitrine-web').expect(200)
    expect(detail.body).toMatchObject({ repo: 'lab-ficticio/vitrine-web', score: 41 })
    await request(server).get('/api/quality/scorecard/nope').expect(404)
  })

  it('relê o arquivo quando o coletor grava um novo relatório', async () => {
    await writeFile(path, JSON.stringify({ ...report, repos: [repo({})] }))
    const later = new Date(Date.now() + 5000)
    await utimes(path, later, later)
    const response = await request(app.getHttpServer()).get('/api/quality/scorecard').expect(200)
    expect(response.body.total).toBe(1)
  })
})

describe('scorecard sem dados', () => {
  it('responde 503 sem arquivo ou com arquivo inválido e mantém o resto do portal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scorecard-'))
    const missing = await start({ PORTAL_SCORECARD_DATA: join(dir, 'nao-existe.json') })
    await request(missing.getHttpServer()).get('/api/quality/scorecard').expect(503)
    await request(missing.getHttpServer()).get('/api/quality/scorecard/x').expect(503)
    await request(missing.getHttpServer()).get('/api/handbook/overview').expect(200)
    await missing.close()

    const broken = join(dir, 'quebrado.json')
    await writeFile(broken, '{ isto não é json')
    const invalid = await start({ PORTAL_SCORECARD_DATA: broken })
    const response = await request(invalid.getHttpServer()).get('/api/quality/scorecard')
    expect(response.status).toBe(503)
    expect(response.body.message).toBe('O arquivo do scorecard está inválido')
    await invalid.close()
  })

  it('aponta para .portal-data na raiz do repositório quando a variável não existe', () => {
    const config = loadConfig({
      PORTAL_HANDBOOK_DIR: join(ROOT, 'handbook'),
      PORTAL_PANEL_DATA: 'x',
    })
    expect(config.scorecardData).toBe(join(ROOT, '.portal-data/scorecard.json'))
    expect(config.docsMaxAgeMonths).toBe(6)
  })
})

describe('política do scorecard', () => {
  it('liga cada checagem a um padrão que existe no handbook', async () => {
    const policy = ScorecardPolicySchema.parse(
      parse(await readFile(join(ROOT, 'catalog/scorecard/policy.yaml'), 'utf8')),
    )
    const handbook = await loadHandbook(join(ROOT, 'handbook'))
    const missing = Object.values(policy.checks).filter(
      (check) => !findStandard(handbook, check.standard),
    )
    expect(missing).toEqual([])
  })
})

describe('validade da documentação na portal-api', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({})
  })
  afterAll(() => app.close())

  it('agrupa por dono, com quem tem mais pendência primeiro e quem não tem dono no fim', async () => {
    const response = await request(app.getHttpServer()).get('/api/quality/docs').expect(200)
    const body = DocsReportSchema.parse(response.body)
    expect(body).toMatchObject({
      generatedAt: NOW.toISOString(),
      maxAgeMonths: 6,
      counts: { ok: 6, expiring: 1, stale: 2, missing: 1 },
    })
    expect(body.owners.map((group) => group.owner)).toEqual([
      '@phalves-lab/arquitetura',
      '@phalves-lab/ia',
      '@phalves-lab/platform',
      '@phalves-lab/seguranca',
      null,
    ])
    expect(body.owners[1]?.items.map((item) => [item.ref, item.status])).toEqual([
      ['IA-01', 'stale'],
      ['IA-02', 'ok'],
    ])
    expect(body.owners[2]?.items.map((item) => item.ref)).toEqual([
      '03-glossario.md',
      '00-indice.md',
      '01-padroes.md',
      '04-modelo-adr.md',
    ])
    expect(body.owners.at(-1)?.items[0]).toMatchObject({
      ref: '05-decisoes-pendentes.md',
      status: 'missing',
      reviewedAt: '2025-12-01',
    })
  })

  it('aceita outro prazo pela query ou pela configuração e recusa prazo fora da faixa', async () => {
    const server = app.getHttpServer()
    const short = await request(server).get('/api/quality/docs?months=3').expect(200)
    expect(short.body.counts).toEqual({ ok: 5, expiring: 0, stale: 4, missing: 1 })
    await request(server).get('/api/quality/docs?months=0').expect(400)
    await request(server).get('/api/quality/docs?months=abc').expect(400)

    const yearly = await start({ PORTAL_DOCS_MAX_AGE_MONTHS: '12' })
    const response = await request(yearly.getHttpServer()).get('/api/quality/docs').expect(200)
    expect(response.body).toMatchObject({ maxAgeMonths: 12, counts: { stale: 0, missing: 1 } })
    await yearly.close()
  })
})
