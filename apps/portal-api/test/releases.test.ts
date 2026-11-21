import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { type PortalConfig, loadConfig } from '../src/config/config.js'
import { GITHUB_CLIENT } from '../src/releases/github.js'
import { FakeGitHub, pull } from './fake-github.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))

const writeCatalog = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'releases-'))
  await writeFile(
    join(dir, 'demo.yaml'),
    [
      'id: demo',
      'name: Demo',
      'repos:',
      '  front: acme/web',
      '  back: acme/api',
      'mode: branch',
      'releaseBranch: release/{yyyy}-{mm}-{dd}',
      'deploy:',
      '  order: [front, back]',
      'ticketUrl: https://exemplo.atlassian.net/browse/{key}',
    ].join('\n'),
  )
  await writeFile(join(dir, 'solo.yaml'), 'id: solo\nname: Solo\nrepos:\n  back: acme/solo\n')
  return dir
}

const SQL_BODY =
  '## Contexto de negócio\n\nImporta campanhas.\n\n```sql\nALTER TABLE a ADD b int;\n```'
const ENV_BODY = '## ENV\n\n- `IMPORT_BATCH_SIZE`: lote da importação\n'

const fakeGitHub = () =>
  new FakeGitHub()
    .repo('acme/api', {
      branches: ['develop', 'main', 'release/2026-10-01'],
      compare: { 'main...develop': { aheadBy: 7, behindBy: 1 } },
      checks: {
        develop: [
          { name: 'build', status: 'completed', conclusion: 'success' },
          { name: 'lint', status: 'completed', conclusion: 'failure' },
        ],
      },
      mergeable: { 60: false },
      pulls: [
        pull({
          number: 40,
          baseRef: 'main',
          headRef: 'develop',
          labels: ['release'],
          mergedAt: '2026-10-01T00:00:00Z',
        }),
        pull({
          number: 50,
          baseRef: 'main',
          headRef: 'develop',
          labels: ['release'],
          mergedAt: '2026-11-01T00:00:00Z',
        }),
        pull({
          number: 45,
          baseRef: 'main',
          headRef: 'hotfix/LAB-9-x',
          mergedAt: '2026-11-05T00:00:00Z',
        }),
        pull({ number: 51, headRef: 'feat/LAB-60-old', mergedAt: '2026-10-20T00:00:00Z' }),
        pull({
          number: 52,
          headRef: 'feat/LAB-61-import',
          mergedAt: '2026-11-02T00:00:00Z',
          body: SQL_BODY,
        }),
        pull({
          number: 53,
          headRef: 'fix/LAB-61-import',
          author: 'bruno',
          mergedAt: '2026-11-03T00:00:00Z',
          body: ENV_BODY,
        }),
        pull({
          number: 54,
          title: 'chore: deps',
          headRef: 'dependabot/npm/x',
          author: 'dependabot[bot]',
          mergedAt: '2026-11-04T00:00:00Z',
        }),
        pull({
          number: 55,
          headRef: 'feat/LAB-62-z',
          author: 'bruno',
          mergedAt: '2026-11-06T00:00:00Z',
          body: '```sql\n-- Não aplicável\n```\n\n## ENV\n\nN/A',
        }),
        pull({
          number: 60,
          title: 'feat: Release',
          baseRef: 'main',
          headRef: 'develop',
          labels: ['release'],
          mergedAt: null,
        }),
      ],
    })
    .repo('acme/web', {
      branches: ['develop', 'main'],
      compare: { 'main...develop': { aheadBy: 2, behindBy: 0 } },
      tags: [
        { name: 'v1.1.0', date: '2026-10-01T00:00:00Z', url: 'https://github.example/t/v1.1.0' },
        { name: 'v1.2.0', date: '2026-11-01T00:00:00Z', url: 'https://github.example/t/v1.2.0' },
      ],
      pulls: [
        pull({ number: 9, headRef: 'feat/LAB-59-x', mergedAt: '2026-10-15T00:00:00Z' }),
        pull({
          number: 10,
          headRef: 'feat/LAB-61-tela',
          author: 'carla',
          mergedAt: '2026-11-05T00:00:00Z',
        }),
      ],
    })
    .repo('acme/solo', { branches: ['develop', 'main'] })

const start = async (config: PortalConfig, github: FakeGitHub | null) => {
  const builder = Test.createTestingModule({ imports: [AppModule.register(config)] })
  if (github) builder.overrideProvider(GITHUB_CLIENT).useValue(github)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return app
}

const configWith = async (extra: Record<string, string> = {}) =>
  loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: HANDBOOK,
    PORTAL_PANEL_DATA: '/nope/data.json',
    PORTAL_RELEASES_DIR: await writeCatalog(),
    ...extra,
  })

describe('release preview with a fake GitHub', () => {
  let app: INestApplication
  let github: FakeGitHub

  beforeAll(async () => {
    github = fakeGitHub()
    app = await start(await configWith({ PORTAL_GITHUB_TOKEN: 'unused' }), github)
  })
  afterAll(() => app.close())

  it('lists projects with catalog defaults', async () => {
    const response = await request(app.getHttpServer()).get('/api/releases/projects').expect(200)
    expect(response.body.map((project: { id: string }) => project.id)).toEqual(['demo', 'solo'])
    expect(response.body[1]).toMatchObject({ source: 'develop', target: 'main', mode: 'pr' })
  })

  it('lists branches of one side with the defaults', async () => {
    const server = app.getHttpServer()
    const response = await request(server)
      .get('/api/releases/projects/demo/branches?side=back')
      .expect(200)
    expect(response.body).toEqual({
      side: 'back',
      repo: 'acme/api',
      defaults: { source: 'develop', target: 'main' },
      branches: ['develop', 'main', 'release/2026-10-01'],
    })
    await request(server).get('/api/releases/projects/demo/branches?side=meio').expect(400)
    await request(server).get('/api/releases/projects/solo/branches?side=front').expect(400)
    await request(server).get('/api/releases/projects/nope/branches?side=back').expect(404)
  })

  it('previews both sides with tickets, SQL, ENV, authors, checks and warnings', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/releases/preview?project=demo&side=both')
      .expect(200)
    const { body } = response
    expect(body.project).toEqual({ id: 'demo', name: 'Demo', mode: 'branch' })
    expect(body.sides.map((side: { side: string }) => side.side)).toEqual(['front', 'back'])
    expect(body.deployOrder).toEqual({ sides: ['back', 'front'], reason: 'migration' })
    expect(body.authors).toEqual(['carla', 'ana', 'bruno'])

    const [front, back] = body.sides
    expect(front.cutoff).toMatchObject({ kind: 'tag', ref: 'v1.2.0' })
    expect(front.tickets.map((ticket: { key: string }) => ticket.key)).toEqual(['LAB-61'])
    expect(front.checks.state).toBe('none')
    expect(front.warnings).toEqual([])

    expect(back).toMatchObject({
      repo: 'acme/api',
      source: 'develop',
      target: 'main',
      aheadBy: 7,
      behindBy: 1,
      pulls: 4,
      cutoff: { kind: 'release-pr', ref: '#50', at: '2026-11-01T00:00:00Z' },
      checks: { state: 'failure', failed: ['lint'] },
      openRelease: { number: 60, head: 'develop', mergeable: false },
      authors: ['ana', 'bruno'],
    })
    expect(back.releaseBranch).toMatch(/^release\/\d{4}-\d{2}-\d{2}$/)
    expect(back.tickets.map((ticket: { key: string | null }) => ticket.key)).toEqual([
      'LAB-61',
      null,
      'LAB-62',
    ])
    const [import61, deps, lab62] = back.tickets
    expect(import61).toMatchObject({
      multiplePulls: true,
      url: 'https://exemplo.atlassian.net/browse/LAB-61',
      summary: 'Importa campanhas.',
      sql: ['ALTER TABLE a ADD b int;'],
      env: { names: ['IMPORT_BATCH_SIZE'] },
    })
    expect(import61.pulls.map((item: { number: number }) => item.number)).toEqual([52, 53])
    expect(deps.authors).toEqual([])
    expect(lab62).toMatchObject({ sql: [], env: { names: [], notes: [] } })
    expect(back.warnings.map((warning: { code: string }) => warning.code)).toEqual([
      'target-ahead',
      'conflict',
      'open-release',
      'checks-failing',
    ])
  })

  it('previews one side with custom branches and caches GitHub reads', async () => {
    const server = app.getHttpServer()
    const before = github.calls.length
    const url = '/api/releases/preview?project=demo&side=back&source=release/2026-10-01&target=main'
    const first = await request(server).get(url).expect(200)
    const calls = github.calls.length
    await request(server).get(url).expect(200)
    expect(github.calls).toHaveLength(calls)
    expect(calls).toBeGreaterThan(before)
    expect(first.body.sides).toHaveLength(1)
    expect(first.body.deployOrder).toBeNull()
    expect(first.body.sides[0]).toMatchObject({
      source: 'release/2026-10-01',
      aheadBy: 0,
      pulls: 0,
    })
    expect(first.body.sides[0].openRelease).toMatchObject({ number: 60 })
  })

  it('warns when there is nothing new and no previous release', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/releases/preview?project=solo&side=back')
      .expect(200)
    expect(
      response.body.sides[0].warnings.map((warning: { code: string }) => warning.code),
    ).toEqual(['nothing-new', 'no-cutoff'])
    expect(response.body.sides[0].releaseBranch).toBeNull()
  })

  it('validates the query and the project sides', async () => {
    const server = app.getHttpServer()
    await request(server).get('/api/releases/preview').expect(400)
    await request(server).get('/api/releases/preview?project=demo&side=meio').expect(400)
    await request(server)
      .get('/api/releases/preview?project=demo&source=main&target=main')
      .expect(400)
    await request(server).get('/api/releases/preview?project=demo&target=develop').expect(400)
    await request(server).get('/api/releases/preview?project=demo&source=..%2Fx').expect(400)
    await request(server).get('/api/releases/preview?project=nope').expect(404)
    const solo = await request(server)
      .get('/api/releases/preview?project=solo&side=both')
      .expect(400)
    expect(solo.body.message).toContain('só tem o lado back')
    await request(server).get('/api/releases/preview?project=solo&side=front').expect(400)
    const missing = await request(server)
      .get('/api/releases/preview?project=demo&side=back&source=nao-existe')
      .expect(404)
    expect(missing.body.message).toContain('não encontrado no GitHub')
  })
})

describe('release preview without a GitHub token', () => {
  it('serves the catalog but answers 503 with a clear message on GitHub routes', async () => {
    const app = await start(await configWith(), null)
    const server = app.getHttpServer()
    await request(server).get('/api/releases/projects').expect(200)
    const preview = await request(server).get('/api/releases/preview?project=demo').expect(503)
    expect(preview.body.message).toContain('PORTAL_GITHUB_TOKEN')
    await request(server).get('/api/releases/projects/demo/branches?side=front').expect(503)
    await app.close()
  })

  it('reads the lab catalog next to the handbook by default', async () => {
    const app = await start(
      loadConfig({ NODE_ENV: 'test', PORTAL_HANDBOOK_DIR: HANDBOOK, PORTAL_PANEL_DATA: 'x.json' }),
      null,
    )
    const response = await request(app.getHttpServer()).get('/api/releases/projects').expect(200)
    expect(response.body).toContainEqual(
      expect.objectContaining({
        id: 'eng-platform-lab',
        repos: { front: 'phalves-lab/eng-platform-lab', back: 'phalves-lab/eng-platform-lab' },
        source: 'develop',
        target: 'main',
      }),
    )
    await app.close()
  })
})

describe('release routes throttling', () => {
  it('limits GitHub-backed routes per client', async () => {
    const app = await start(await configWith(), fakeGitHub())
    const server = app.getHttpServer()
    for (let i = 0; i < 30; i += 1) await request(server).get('/api/releases/projects').expect(200)
    await request(server).get('/api/releases/projects').expect(429)
    await app.close()
  })
})
