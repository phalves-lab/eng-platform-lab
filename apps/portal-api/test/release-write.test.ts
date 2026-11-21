import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { type ReleasePlan, ReleasePlanSchema } from '@lab/contracts'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { loadConfig } from '../src/config/config.js'
import { GITHUB_CLIENT } from '../src/releases/github.js'
import { GITHUB_WRITER } from '../src/releases/github-writer.js'
import { releaseDate } from '../src/releases/plan-rules.js'
import { RELEASE_RUN_STORE } from '../src/releases/run-store.js'
import { FakeGitHub, fakeSha, pull } from './fake-github.js'
import { FakeGitHubWriter } from './fake-github-writer.js'
import { MemoryReleaseRunStore } from './memory-run-store.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const TODAY = releaseDate(new Date())
const RELEASE_BRANCH = `release/${TODAY}`
const SQL_BODY =
  '## Contexto de negócio\n\nImporta campanhas.\n\n```sql\nALTER TABLE a ADD b int;\n```'
const ENV_BODY = '## ENV\n\n- `IMPORT_BATCH_SIZE`: lote da importação\n'

const writeCatalog = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-write-'))
  await writeFile(
    join(dir, 'duo.yaml'),
    [
      'id: duo',
      'name: Duo',
      'repos:',
      '  front: acme/web',
      '  back: acme/api',
      'ticketUrl: https://exemplo.atlassian.net/browse/{key}',
    ].join('\n'),
  )
  await writeFile(
    join(dir, 'cut.yaml'),
    'id: cut\nname: Cut\nrepos:\n  back: acme/cut\nmode: branch\n',
  )
  await writeFile(
    join(dir, 'mono.yaml'),
    'id: mono\nname: Mono\nrepos:\n  front: acme/mono\n  back: acme/mono\n',
  )
  await writeFile(join(dir, 'idle.yaml'), 'id: idle\nname: Idle\nrepos:\n  back: acme/idle\n')
  return dir
}

const merged = (number: number, extra: Partial<Parameters<typeof pull>[0]> = {}) =>
  pull({ number, mergedAt: '2026-11-15T10:00:00Z', ...extra })

const fakeGitHub = () =>
  new FakeGitHub()
    .repo('acme/api', {
      branches: ['develop', 'main'],
      compare: { 'main...develop': { aheadBy: 3, behindBy: 0 } },
      pulls: [
        merged(11, { headRef: 'feat/LAB-61-import', body: SQL_BODY }),
        merged(12, { headRef: 'fix/LAB-61-import', author: 'bruno', body: ENV_BODY }),
      ],
    })
    .repo('acme/web', {
      branches: ['develop', 'main'],
      compare: { 'main...develop': { aheadBy: 1, behindBy: 0 } },
      pulls: [merged(21, { headRef: 'feat/LAB-61-tela', author: 'carla' })],
    })
    .repo('acme/cut', {
      branches: ['develop', 'main'],
      compare: { 'main...develop': { aheadBy: 1, behindBy: 0 } },
      pulls: [merged(31, { headRef: 'feat/LAB-70-corte' })],
    })
    .repo('acme/mono', {
      branches: ['develop', 'main'],
      compare: { 'main...develop': { aheadBy: 2, behindBy: 0 } },
      pulls: [merged(41, { headRef: 'feat/LAB-80-mono', body: SQL_BODY })],
    })
    .repo('acme/idle', { branches: ['develop', 'main'] })

interface Harness {
  app: INestApplication
  github: FakeGitHub
  writer: FakeGitHubWriter
  store: MemoryReleaseRunStore
}

const start = async (
  env: Record<string, string>,
  options: { store?: boolean } = {},
): Promise<Harness> => {
  const github = fakeGitHub()
  const writer = new FakeGitHubWriter(github)
  const store = new MemoryReleaseRunStore()
  const config = loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: HANDBOOK,
    PORTAL_RELEASES_DIR: await writeCatalog(),
    PORTAL_GITHUB_TOKEN: 'unused',
    PORTAL_PANEL_DATA: '/nope/data.json',
    ...env,
  })
  const builder = Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(GITHUB_CLIENT)
    .useValue(github)
    .overrideProvider(GITHUB_WRITER)
    .useValue(config.releaseWrite.enabled ? writer : null)
  if (options.store !== false) builder.overrideProvider(RELEASE_RUN_STORE).useValue(store)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return { app, github, writer, store }
}

const LEAD = { PORTAL_DEV_USER: 'lider.lab', PORTAL_LEAD_LOGINS: 'lider.lab' }
const WRITE_ON = {
  ...LEAD,
  PORTAL_RELEASE_WRITE_ENABLED: 'true',
  PORTAL_GITHUB_WRITE_TOKEN: 'unused',
  DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
}

const planOf = async (app: INestApplication, body: Record<string, unknown>) => {
  const response = await request(app.getHttpServer())
    .post('/api/releases/plan')
    .send(body)
    .expect(200)
  return ReleasePlanSchema.parse(response.body)
}

const execute = (app: INestApplication, body: Record<string, unknown>, plan: ReleasePlan) =>
  request(app.getHttpServer())
    .post('/api/releases/execute')
    .send({ ...body, hash: plan.hash, confirm: plan.confirm })

describe('release writes for a dev', () => {
  let harness: Harness
  beforeAll(async () => {
    harness = await start({ ...WRITE_ON, PORTAL_DEV_USER: 'dev.lab' })
  })
  afterAll(() => harness.app.close())

  it('keeps the dev on the preview: no plan, no execution, no publish', async () => {
    const server = harness.app.getHttpServer()
    const plan = await request(server).post('/api/releases/plan').send({ project: 'duo' })
    expect(plan.status).toBe(403)
    expect(plan.body.message).toContain('Só líder ou admin')
    await request(server)
      .post('/api/releases/execute')
      .send({ project: 'duo', hash: 'a'.repeat(64), confirm: ['acme/web', 'acme/api'] })
      .expect(403)
    await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/api', number: 1 })
      .expect(403)
    await request(server)
      .post('/api/releases/publish/execute')
      .send({ project: 'duo', repo: 'acme/api', number: 1, hash: 'a'.repeat(64), confirm: ['x'] })
      .expect(403)
    await request(server).get('/api/releases/history?project=duo').expect(200)
    expect(harness.writer.calls).toEqual([])
    expect(harness.store.runs).toEqual([])
  })
})

describe('release writes with the flag off', () => {
  let harness: Harness
  beforeAll(async () => {
    harness = await start(LEAD)
  })
  afterAll(() => harness.app.close())

  it('plans but refuses to execute, and audits the refusal', async () => {
    const plan = await planOf(harness.app, { project: 'duo' })
    expect(plan.writeEnabled).toBe(false)
    const response = await execute(harness.app, { project: 'duo' }, plan).expect(403)
    expect(response.body.message).toContain('PORTAL_RELEASE_WRITE_ENABLED=false')
    expect(harness.writer.calls).toEqual([])
    expect(harness.store.runs).toHaveLength(1)
    expect(harness.store.runs[0]).toMatchObject({
      action: 'release',
      actor: 'lider.lab',
      status: 'rejected',
      result: { error: expect.stringContaining('desabilitada') },
    })
    await request(harness.app.getHttpServer())
      .post('/api/releases/publish/execute')
      .send({ project: 'duo', repo: 'acme/api', number: 1, hash: 'a'.repeat(64), confirm: ['x'] })
      .expect(403)
  })
})

describe('release writes without a database', () => {
  let harness: Harness
  beforeAll(async () => {
    harness = await start(LEAD, { store: false })
  })
  afterAll(() => harness.app.close())

  it('answers 503 for tracking and history and still refuses to write', async () => {
    const server = harness.app.getHttpServer()
    const tracking = await request(server).get('/api/releases/tracking?project=duo').expect(503)
    expect(tracking.body.message).toContain('DATABASE_URL')
    await request(server).get('/api/releases/history?project=duo').expect(503)
    await request(server).get('/api/releases/history').expect(400)
    await request(server).get('/api/releases/tracking?project=nope').expect(404)
    const plan = await planOf(harness.app, { project: 'idle', side: 'back' })
    expect(plan.blockers[0]).toContain('Nada novo')
    await execute(harness.app, { project: 'idle', side: 'back' }, plan).expect(403)
  })
})

describe('release writes with the flag on', () => {
  let harness: Harness
  beforeEach(async () => {
    harness = await start(WRITE_ON)
  })
  afterEach(() => harness.app.close())

  it('plans two linked PRs with one checklist and the deploy order', async () => {
    const plan = await planOf(harness.app, { project: 'duo' })
    expect(plan).toMatchObject({
      kind: 'release',
      side: 'both',
      source: 'develop',
      target: 'main',
      writeEnabled: true,
      blockers: [],
      confirm: ['acme/web', 'acme/api'],
      deployOrder: { sides: ['back', 'front'], reason: 'migration' },
    })
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'create-pull',
      'add-labels',
      'add-assignees',
      'create-pull',
      'add-labels',
      'add-assignees',
      'link-pulls',
    ])
    const [front, back] = plan.pulls
    expect(front).toMatchObject({
      sides: ['front'],
      head: 'develop',
      base: 'main',
      existing: null,
      branch: null,
      labels: ['release', 'pre-release-notes'],
      assignees: ['carla'],
      title: `chore(release): release ${TODAY} (front)`,
    })
    expect(back?.assignees).toEqual(['ana', 'bruno'])
    expect(back?.sha).toBe(fakeSha('acme/api:develop'))
    expect(plan.checklist.sql).toEqual([
      {
        sides: ['back'],
        repo: 'acme/api',
        key: 'LAB-61',
        pulls: [11, 12],
        sql: 'ALTER TABLE a ADD b int;',
      },
    ])
    expect(plan.checklist.env[0]).toMatchObject({ repo: 'acme/api', names: ['IMPORT_BATCH_SIZE'] })
    for (const item of plan.pulls) {
      expect(item.body).toContain('ALTER TABLE a ADD b int;')
      expect(item.body).toContain('`IMPORT_BATCH_SIZE`')
      expect(item.body).toContain('1. Back')
    }
    expect(front?.body).toContain('**PR ligada:** Back em acme/api (o link entra')
    expect(back?.body).toContain('[LAB-61](https://exemplo.atlassian.net/browse/LAB-61)')
    expect(harness.writer.calls).toEqual([])
  })

  it('checks role, confirmation and hash before writing, then creates and links both PRs', async () => {
    const server = harness.app.getHttpServer()
    const plan = await planOf(harness.app, { project: 'duo' })

    const typo = await request(server)
      .post('/api/releases/execute')
      .send({ project: 'duo', hash: plan.hash, confirm: ['acme/web', 'acme/ap'] })
      .expect(400)
    expect(typo.body.message).toContain('acme/web, acme/api')
    await request(server)
      .post('/api/releases/execute')
      .send({ project: 'duo', hash: 'b'.repeat(64), confirm: plan.confirm })
      .expect(409)
    await request(server)
      .post('/api/releases/execute')
      .send({ project: 'duo', hash: 'nope', confirm: plan.confirm })
      .expect(400)
    expect(harness.writer.calls).toEqual([])
    expect(harness.store.runs.map((run) => run.status)).toEqual(['rejected', 'rejected'])

    const response = await execute(harness.app, { project: 'duo' }, plan).expect(200)
    expect(response.body).toMatchObject({
      status: 'success',
      completed: 7,
      total: 7,
      error: null,
      branches: [],
      pulls: [
        { sides: ['front'], repo: 'acme/web', number: 900, action: 'created' },
        { sides: ['back'], repo: 'acme/api', number: 901, action: 'created' },
      ],
    })
    expect(harness.writer.calls).toEqual([
      'createPull acme/web develop->main',
      'addLabels acme/web 900 release,pre-release-notes',
      'addAssignees acme/web 900 carla',
      'createPull acme/api develop->main',
      'addLabels acme/api 901 release,pre-release-notes',
      'addAssignees acme/api 901 ana,bruno',
      'updatePullBody acme/web 900',
      'updatePullBody acme/api 901',
    ])
    const web = harness.github.state('acme/web').pulls.find((item) => item.number === 900)
    const api = harness.github.state('acme/api').pulls.find((item) => item.number === 901)
    expect(web?.body).toContain(
      '**PR ligada:** Back em [acme/api#901](https://github.example/acme/api/pull/901)',
    )
    expect(api?.body).toContain(
      '**PR ligada:** Front em [acme/web#900](https://github.example/acme/web/pull/900)',
    )
    expect(api?.labels).toEqual(['release', 'pre-release-notes'])

    const run = harness.store.runs.at(-1)
    expect(run).toMatchObject({ action: 'release', status: 'success', planHash: plan.hash })
    expect(run?.plan).toMatchObject({ kind: 'release', hash: plan.hash })
    const history = await request(server).get('/api/releases/history?project=duo').expect(200)
    expect(history.body.map((item: { result: { status: string } }) => item.result.status)).toEqual([
      'success',
      'rejected',
      'rejected',
    ])
  })

  it('updates the open release PRs instead of opening new ones', async () => {
    const first = await planOf(harness.app, { project: 'duo' })
    await execute(harness.app, { project: 'duo' }, first).expect(200)
    harness.writer.calls.length = 0
    harness.github.state('acme/api').pulls.push(merged(13, { headRef: 'feat/LAB-62-extra' }))

    const second = await planOf(harness.app, { project: 'duo' })
    expect(second.steps.map((step) => step.kind)).toEqual([
      'update-pull',
      'add-labels',
      'add-assignees',
      'update-pull',
      'add-labels',
      'add-assignees',
    ])
    expect(second.pulls.map((item) => item.existing?.number)).toEqual([900, 901])
    expect(second.pulls[0]?.body).toContain(
      '[acme/api#901](https://github.example/acme/api/pull/901)',
    )
    expect(second.pulls[1]?.body).toContain('LAB-62')
    const response = await execute(harness.app, { project: 'duo' }, second).expect(200)
    expect(response.body.pulls.map((item: { action: string }) => item.action)).toEqual([
      'updated',
      'updated',
    ])
    expect(harness.writer.calls.filter((call) => call.startsWith('createPull'))).toEqual([])
  })

  it('cuts a release branch from the source sha and never writes into an existing branch', async () => {
    const plan = await planOf(harness.app, { project: 'cut', side: 'back' })
    const sha = fakeSha('acme/cut:develop')
    expect(plan.steps[0]).toEqual({
      kind: 'create-branch',
      repo: 'acme/cut',
      branch: RELEASE_BRANCH,
      from: 'develop',
      sha,
    })
    expect(plan.pulls[0]).toMatchObject({ head: RELEASE_BRANCH, branch: { action: 'create' } })
    expect(plan.deployOrder).toBeNull()
    await execute(harness.app, { project: 'cut', side: 'back' }, plan).expect(200)
    expect(harness.writer.calls.slice(0, 2)).toEqual([
      `createBranch acme/cut ${RELEASE_BRANCH} ${sha}`,
      `createPull acme/cut ${RELEASE_BRANCH}->main`,
    ])

    const again = await planOf(harness.app, { project: 'cut', side: 'back' })
    expect(again.steps.map((step) => step.kind)).toEqual([
      'update-pull',
      'add-labels',
      'add-assignees',
    ])
  })

  it('reuses a release branch that already points at the source and blocks one that does not', async () => {
    const state = harness.github.state('acme/cut')
    state.branches.push(RELEASE_BRANCH)
    state.heads[RELEASE_BRANCH] = { sha: fakeSha('acme/cut:develop'), date: null }
    const reuse = await planOf(harness.app, { project: 'cut', side: 'back' })
    expect(reuse.steps[0]).toMatchObject({ kind: 'reuse-branch', branch: RELEASE_BRANCH })
    expect(reuse.blockers).toEqual([])

    state.heads[RELEASE_BRANCH] = { sha: fakeSha('outro'), date: null }
    const blocked = await planOf(harness.app, { project: 'cut', side: 'back' })
    expect(blocked.blockers[0]).toContain('o portal não escreve em branch existente')
    expect(blocked.steps.some((step) => step.kind === 'create-branch')).toBe(false)
    const response = await execute(harness.app, { project: 'cut', side: 'back' }, blocked).expect(
      409,
    )
    expect(response.body.message).toContain(RELEASE_BRANCH)
    expect(harness.writer.calls).toEqual([])
  })

  it('lists only PRs merged before the head of an existing release branch', async () => {
    const state = harness.github.state('acme/cut')
    state.branches.push('release/2026-11-16')
    state.heads['release/2026-11-16'] = { sha: fakeSha('cut-16'), date: '2026-11-16T00:00:00Z' }
    state.pulls.push(
      merged(32, { headRef: 'feat/LAB-71-depois', mergedAt: '2026-11-18T00:00:00Z' }),
      pull({
        number: 33,
        title: 'chore(release): release 2026-11-16',
        headRef: 'release/2026-11-16',
        baseRef: 'main',
        mergedAt: null,
      }),
    )
    const plan = await planOf(harness.app, { project: 'cut', side: 'back' })
    expect(plan.pulls[0]).toMatchObject({
      head: 'release/2026-11-16',
      sha: fakeSha('cut-16'),
      existing: { number: 33 },
      branch: null,
    })
    expect(plan.pulls[0]?.body).toContain('LAB-70')
    expect(plan.pulls[0]?.body).not.toContain('LAB-71')

    state.branches = state.branches.filter((branch) => branch !== 'release/2026-11-16')
    const gone = await planOf(harness.app, { project: 'cut', side: 'back' })
    expect(gone.blockers[0]).toContain('não existe mais')
  })

  it('opens a single PR for a monorepo that declares both sides', async () => {
    const plan = await planOf(harness.app, { project: 'mono' })
    expect(plan.pulls).toHaveLength(1)
    expect(plan.pulls[0]).toMatchObject({ sides: ['front', 'back'], repo: 'acme/mono' })
    expect(plan.pulls[0]?.title).toBe(`chore(release): release ${TODAY}`)
    expect(plan.pulls[0]?.body).not.toContain('**PR ligada:**')
    expect(plan.checklist.sql).toHaveLength(1)
    expect(plan.confirm).toEqual(['acme/mono'])
    expect(plan.steps.some((step) => step.kind === 'link-pulls')).toBe(false)
  })

  it('blocks a release with nothing new and validates the request', async () => {
    const server = harness.app.getHttpServer()
    const plan = await planOf(harness.app, { project: 'idle', side: 'back' })
    expect(plan.blockers).toEqual([
      'Nada novo para a release em acme/idle: nenhum PR mergeado em develop desde o último corte.',
    ])
    await execute(harness.app, { project: 'idle', side: 'back' }, plan).expect(409)
    await request(server).post('/api/releases/plan').send({}).expect(400)
    await request(server).post('/api/releases/plan').send({ project: 'nope' }).expect(404)
    await request(server)
      .post('/api/releases/plan')
      .send({ project: 'duo', source: 'main', target: 'main' })
      .expect(400)
    await request(server)
      .post('/api/releases/plan')
      .send({ project: 'duo', source: 'nao-existe' })
      .expect(404)
  })

  it('records a failed run with what was written before the error', async () => {
    harness.writer.failOn('addLabels', 403)
    const plan = await planOf(harness.app, { project: 'cut', side: 'back' })
    const response = await execute(harness.app, { project: 'cut', side: 'back' }, plan).expect(200)
    expect(response.body).toMatchObject({
      status: 'failed',
      completed: 2,
      total: 4,
      branches: [{ repo: 'acme/cut', name: RELEASE_BRANCH }],
      pulls: [{ number: 900, action: 'created' }],
      error: expect.stringContaining('403'),
    })
    expect(harness.store.runs.at(-1)).toMatchObject({ status: 'failed' })
  })

  it('tracks the release PRs and publishes the tag and release after the merge', async () => {
    const server = harness.app.getHttpServer()
    const plan = await planOf(harness.app, { project: 'duo' })
    await execute(harness.app, { project: 'duo' }, plan).expect(200)
    const api = harness.github.state('acme/api')
    api.reviews[901] = [
      { author: 'rev1', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-20T10:00:00Z' },
      { author: 'rev1', state: 'APPROVED', submittedAt: '2026-11-20T11:00:00Z' },
      { author: 'rev2', state: 'COMMENTED', submittedAt: '2026-11-20T12:00:00Z' },
    ]
    api.workflows['develop'] = [{ status: 'in_progress', conclusion: null, url: 'https://ci/1' }]
    api.checks[fakeSha('acme/api:develop')] = [
      { name: 'verify', status: 'completed', conclusion: 'success' },
    ]

    const open = await request(server).get('/api/releases/tracking?project=duo').expect(200)
    expect(open.body.writeEnabled).toBe(true)
    expect(open.body.pulls).toHaveLength(2)
    const tracked = open.body.pulls.find((item: { repo: string }) => item.repo === 'acme/api')
    expect(tracked).toMatchObject({
      number: 901,
      state: 'open',
      lastRunBy: 'lider.lab',
      summary: { state: 'pending', url: 'https://ci/1' },
      checks: { state: 'success', total: 1 },
      approvals: { approved: ['rev1'], changesRequested: [] },
      published: null,
    })

    const early = await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/api', number: 901 })
      .expect(200)
    expect(early.body.blockers[0]).toContain('ainda não foi mergeada')
    expect(early.body.steps).toEqual([])

    const releasePull = api.pulls.find((item) => item.number === 901)
    if (releasePull) releasePull.mergedAt = '2026-11-21T15:00:00Z'
    api.tags.push({ name: 'release-2026-11-21', date: null, url: 'x' })
    const publish = await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/api', number: 901 })
      .expect(200)
    expect(publish.body).toMatchObject({
      kind: 'publish',
      tag: 'release-2026-11-21-2',
      sha: fakeSha('acme/api:merge:901'),
      name: 'Release 2026-11-21-2',
      blockers: [],
      confirm: ['acme/api'],
    })
    expect(publish.body.body).toContain('## Tasks')
    expect(publish.body.body).not.toContain('<!-- portal-release -->')

    await request(server)
      .post('/api/releases/publish/execute')
      .send({
        project: 'duo',
        repo: 'acme/api',
        number: 901,
        hash: publish.body.hash,
        confirm: ['acme/web'],
      })
      .expect(400)
    const done = await request(server)
      .post('/api/releases/publish/execute')
      .send({
        project: 'duo',
        repo: 'acme/api',
        number: 901,
        hash: publish.body.hash,
        confirm: ['acme/api'],
      })
      .expect(200)
    expect(done.body).toMatchObject({
      status: 'success',
      release: {
        repo: 'acme/api',
        number: 901,
        tag: 'release-2026-11-21-2',
        url: 'https://github.example/acme/api/releases/tag/release-2026-11-21-2',
      },
    })
    expect(harness.writer.calls.slice(-2)).toEqual([
      `createTag acme/api release-2026-11-21-2 ${fakeSha('acme/api:merge:901')}`,
      'createRelease acme/api release-2026-11-21-2',
    ])

    const after = await request(server).get('/api/releases/tracking?project=duo').expect(200)
    expect(
      after.body.pulls.find((item: { repo: string }) => item.repo === 'acme/api'),
    ).toMatchObject({ state: 'merged', published: { tag: 'release-2026-11-21-2' } })
    const again = await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/api', number: 901 })
      .expect(200)
    expect(again.body.blockers[0]).toContain('já foi publicada')
    await request(server)
      .post('/api/releases/publish/execute')
      .send({
        project: 'duo',
        repo: 'acme/api',
        number: 901,
        hash: again.body.hash,
        confirm: ['acme/api'],
      })
      .expect(409)

    await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/api', number: 11 })
      .expect(404)
    await request(server)
      .post('/api/releases/publish/plan')
      .send({ project: 'duo', repo: 'acme/other', number: 901 })
      .expect(400)
    const history = await request(server).get('/api/releases/history?project=duo').expect(200)
    expect(history.body[0]).toMatchObject({ action: 'publish', result: { status: 'rejected' } })
    expect(history.body[1]).toMatchObject({ action: 'publish', result: { status: 'success' } })
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('release audit on Postgres', () => {
  let db: IsolatedSchema
  let harness: Harness

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
    harness = await start({ ...WRITE_ON, DATABASE_URL: db.connectionString }, { store: false })
  })

  afterAll(async () => {
    await harness.app.close()
    await db.drop()
  })

  it('writes the audit row and serves history and tracking from the database', async () => {
    const plan = await planOf(harness.app, { project: 'cut', side: 'back' })
    await execute(harness.app, { project: 'cut', side: 'back' }, plan).expect(200)
    const rows = await db.pool.query<{ actor: string; status: string; plan_hash: string }>(
      'SELECT actor, status, plan_hash FROM release_runs',
    )
    expect(rows.rows).toEqual([{ actor: 'lider.lab', status: 'success', plan_hash: plan.hash }])
    const server = harness.app.getHttpServer()
    const history = await request(server).get('/api/releases/history?project=cut').expect(200)
    expect(history.body[0]).toMatchObject({ actor: 'lider.lab', role: 'lead', action: 'release' })
    const tracking = await request(server).get('/api/releases/tracking?project=cut').expect(200)
    expect(tracking.body.pulls[0]).toMatchObject({ repo: 'acme/cut', number: 900, state: 'open' })
  })
})
