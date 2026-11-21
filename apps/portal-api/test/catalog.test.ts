import 'reflect-metadata'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

const start = async (env: Record<string, string>) => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: join(ROOT, 'handbook'),
    PORTAL_PANEL_DATA: '/nope/data.json',
    ...env,
  })
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] }).compile()
  const app = module.createNestApplication({ logger: false })
  await app.init()
  return app
}

describe('catálogo de IA na portal-api', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({})
  })
  afterAll(() => app.close())

  it('lista plugins do marketplace padrão com maturidade, dono e quantidade de skills', async () => {
    const response = await request(app.getHttpServer()).get('/api/catalog/plugins').expect(200)
    expect(response.body).toHaveLength(5)
    expect(response.body[0]).toEqual({
      name: 'lab-pr-review',
      displayName: 'Revisão de PR',
      description: expect.any(String),
      version: '2.1.0',
      author: 'Plataforma do laboratório',
      keywords: ['review', 'pull-request', 'qualidade'],
      maturity: 'approved',
      owner: '@phalves-lab/platform',
      reviewedAt: '2026-11-14',
      skillCount: 2,
    })
    expect(response.body.at(-1)).toMatchObject({
      name: 'lab-changelog',
      maturity: 'draft',
      owner: null,
    })
  })

  it('filtra por maturidade e termo e recusa maturidade desconhecida', async () => {
    const server = app.getHttpServer()
    const pilots = await request(server).get('/api/catalog/plugins?maturity=pilot').expect(200)
    expect(pilots.body.map((plugin: { name: string }) => plugin.name)).toEqual([
      'lab-grill',
      'lab-onboarding',
    ])
    const byTerm = await request(server).get('/api/catalog/plugins?term=release').expect(200)
    expect(byTerm.body.map((plugin: { name: string }) => plugin.name)).toEqual(['lab-changelog'])
    await request(server).get('/api/catalog/plugins?maturity=beta').expect(400)
  })

  it('detalha um plugin com skills e comandos de instalação', async () => {
    const server = app.getHttpServer()
    const plugin = await request(server).get('/api/catalog/plugins/lab-onboarding').expect(200)
    expect(plugin.body.skills).toEqual([
      { name: 'doctor', description: expect.stringContaining('ferramentas locais') },
      { name: 'onboarding', description: expect.stringContaining('governança') },
    ])
    expect(plugin.body.install).toEqual({
      marketplace: 'lab-marketplace',
      commands: [
        '/plugin marketplace add ./fixtures/marketplace',
        '/plugin install lab-onboarding@lab-marketplace',
      ],
    })
    await request(server).get('/api/catalog/plugins/nope').expect(404)
  })

  it('lista os MCPs homologados com escopo e instalação por cliente', async () => {
    const response = await request(app.getHttpServer()).get('/api/catalog/mcps').expect(200)
    expect(
      response.body.map((mcp: { name: string; scope: string }) => [mcp.name, mcp.scope]),
    ).toEqual([
      ['martech-context', 'read'],
      ['github', 'read'],
      ['atlassian', 'write'],
      ['playwright', 'write'],
    ])
    expect(response.body[0].install[0]).toEqual({
      client: 'claude-code',
      language: 'bash',
      file: null,
      snippet: expect.stringContaining('claude mcp add martech-context'),
    })
  })
})

describe('catálogo de IA indisponível', () => {
  it('responde 503 no catálogo e mantém o resto do portal no ar', async () => {
    const app = await start({ PORTAL_MARKETPLACE_DIR: '/nope/marketplace' })
    const server = app.getHttpServer()
    await request(server).get('/api/catalog/plugins').expect(503)
    await request(server).get('/api/catalog/plugins/lab-grill').expect(503)
    await request(server).get('/api/catalog/mcps').expect(503)
    await request(server).get('/api/handbook/overview').expect(200)
    await app.close()
  })

  it('lê um marketplace em outra pasta mesmo com entrada órfã no overlay', async () => {
    const market = await mkdtemp(join(tmpdir(), 'market-'))
    const overlay = await mkdtemp(join(tmpdir(), 'overlay-'))
    await mkdir(join(market, '.claude-plugin'))
    await writeFile(
      join(market, '.claude-plugin/marketplace.json'),
      JSON.stringify({ name: 'org', plugins: [{ name: 'solo', source: './solo' }] }),
    )
    await writeFile(
      join(overlay, 'plugins.yaml'),
      "marketplace:\n  source: org/plugins\nplugins:\n  - { name: gone, maturity: pilot, owner: x, reviewedAt: '2026-01-01' }\n",
    )
    await writeFile(join(overlay, 'mcps.yaml'), 'mcps: []\n')
    const app = await start({ PORTAL_MARKETPLACE_DIR: market, PORTAL_AI_CATALOG_DIR: overlay })
    const plugins = await request(app.getHttpServer()).get('/api/catalog/plugins').expect(200)
    expect(plugins.body).toEqual([
      expect.objectContaining({ name: 'solo', maturity: 'draft', skillCount: 0 }),
    ])
    await app.close()
  })
})
