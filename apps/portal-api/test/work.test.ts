import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { MyWorkResponseSchema, TeamWorkResponseSchema } from '@lab/contracts'
import { JiraRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import type { WorkDataset, WorkIssue } from '@lab/flow'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { TOKEN_VERIFIER } from '../src/auth/token-verifier.js'
import { loadConfig } from '../src/config/config.js'
import { loadPeopleDirectory } from '../src/people/people.js'
import {
  DatabaseWorkData,
  WORK_DATA,
  type WorkData,
  createWorkData,
} from '../src/work/work-data.js'
import { WORK_CLOCK } from '../src/work/work.service.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const CATALOG = fileURLToPath(new URL('../../../catalog/people', import.meta.url))
const NOW = new Date('2026-11-20T12:00:00.000Z')

const CAMPANHAS = `
team: campanhas
name: Campanhas
people:
  - { login: carla.mendes, name: Carla Mendes, jira: carla, github: carla }
  - { login: ana.figueira, name: Ana Figueira, jira: ana, github: ana, role: lead }
  - { login: bruno.tavares, name: Bruno Tavares, jira: bruno, github: bruno }
  - { login: davi.prado, name: Davi Prado, jira: davi, github: null }
`
const DADOS = `
team: dados
name: Dados
people:
  - { login: elisa.rocha, name: Elisa Rocha, jira: elisa, github: elisa, role: lead }
`

const writePeople = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), 'people-'))
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}

const row = (number: number, overrides: Record<string, unknown>) => ({
  position: number,
  number,
  title: `feat: LAB-${number}`,
  url: `https://example.invalid/pr/${number}`,
  author: 'ana',
  taskKey: null,
  taskStatus: null,
  requestedReviewers: [],
  reviewedBy: [],
  enteredAt: '2026-11-18T10:00:00.000Z',
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
    generatedAt: NOW.toISOString(),
    queue: [
      row(1, {
        author: 'bruno',
        requestedReviewers: ['carla'],
        level: 'atrasado',
        ageBusinessDays: 4,
      }),
      row(2, { author: 'carla', checks: 'FAILURE' }),
      row(3, { author: 'carla', botSignal: 'ajustes' }),
      row(4, { author: 'carla', hasHumanReview: true }),
      row(5, { author: 'carla', requestedReviewers: ['ana'] }),
      row(6, { author: 'ana', requestedReviewers: ['bruno'] }),
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

const issue = (key: string, overrides: Partial<WorkIssue>): WorkIssue => ({
  key,
  project: key.split('-')[0] ?? 'LAB',
  component: 'Portal',
  issueType: 'Story',
  status: 'Em andamento',
  summary: `Item ${key}`,
  url: `https://jira.example.test/browse/${key}`,
  epicKey: null,
  assignee: 'carla',
  createdAt: '2026-11-02T12:00:00.000Z',
  resolvedAt: null,
  ...overrides,
})

const move = (issueKey: string, toStatus: string, changedAt: string) => ({
  issueKey,
  fromStatus: 'A fazer',
  toStatus,
  changedAt,
})

const workDataset = (): WorkDataset => ({
  issues: [
    issue('LAB-1', {}),
    issue('LAB-2', { status: 'Code Review' }),
    issue('LAB-3', { status: 'Bloqueado' }),
    issue('LAB-4', { status: 'Bloqueado', assignee: 'bruno' }),
    issue('LAB-5', { assignee: 'bruno', createdAt: '2026-11-16T12:00:00.000Z' }),
    issue('LAB-6', { status: 'Concluído', assignee: 'davi' }),
    issue('LAB-7', { issueType: 'Epic' }),
    issue('LAB-8', { assignee: 'Pessoa Externa' }),
    issue('OPS-1', { status: 'Em execução', component: 'Filas' }),
  ],
  changes: [
    move('LAB-1', 'Em andamento', '2026-11-19T12:00:00.000Z'),
    move('LAB-2', 'Code Review', '2026-11-13T12:00:00.000Z'),
    move('LAB-3', 'Bloqueado', '2026-11-18T12:00:00.000Z'),
    move('LAB-4', 'Bloqueado', '2026-11-19T12:00:00.000Z'),
    move('LAB-8', 'Em andamento', '2026-11-19T12:00:00.000Z'),
    move('OPS-1', 'Em execução', '2026-11-14T00:00:00.000Z'),
  ],
  links: [
    { blockedKey: 'LAB-4', blockerKey: 'LAB-1' },
    { blockedKey: 'LAB-6', blockerKey: 'LAB-1' },
    { blockedKey: 'LAB-8', blockerKey: 'LAB-2' },
    { blockedKey: 'LAB-3', blockerKey: 'LAB-1' },
  ],
})

const USERS: Record<string, { login: string; name: string; role: string }> = {
  carla: { login: 'Carla.Mendes', name: 'Carla', role: 'dev' },
  davi: { login: 'davi.prado', name: 'Davi', role: 'dev' },
  ana: { login: 'ana.figueira', name: 'Ana', role: 'lead' },
  admin: { login: 'root.admin', name: 'Admin', role: 'admin' },
  nobody: { login: 'nobody', name: 'Ninguém', role: 'dev' },
}

const startWorkApp = async (
  data: WorkData | null,
  env: Record<string, string> = {},
): Promise<INestApplication> => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: HANDBOOK,
    PORTAL_AUTH_MODE: 'entra',
    PORTAL_JWKS_URL: 'https://login.example.invalid/keys',
    PORTAL_JWT_ISSUER: 'issuer',
    PORTAL_JWT_AUDIENCE: 'audience',
    PORTAL_PANEL_DATA: await writePanelData(),
    PORTAL_PEOPLE_DIR: await writePeople({ 'campanhas.yaml': CAMPANHAS, 'dados.yaml': DADOS }),
    ...env,
  })
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(TOKEN_VERIFIER)
    .useValue({
      verify: (token: string) => {
        const user = USERS[token]
        return user ? Promise.resolve(user) : Promise.reject(new Error('bad token'))
      },
    })
    .overrideProvider(WORK_DATA)
    .useValue(data)
    .overrideProvider(WORK_CLOCK)
    .useValue(() => NOW)
    .compile()
  const app = module.createNestApplication()
  await app.init()
  return app
}

const fakeWork = (dataset: WorkDataset | null): WorkData => ({
  load: () => Promise.resolve(dataset),
})

const keys = (items: { key: string }[]) => items.map((item) => item.key)

describe('my work', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await startWorkApp(fakeWork(workDataset()))
  })
  afterAll(() => app.close())

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)

  it('links the portal login to the Jira and GitHub accounts of the people catalog', async () => {
    const body = MyWorkResponseSchema.parse((await get('/api/me/work', 'carla').expect(200)).body)
    expect(body.person).toMatchObject({
      login: 'carla.mendes',
      jira: 'carla',
      github: 'carla',
      team: { id: 'campanhas', name: 'Campanhas' },
    })
    expect(body.review).toMatchObject({ state: 'ready', github: 'carla' })
  })

  it('groups my open tasks by situation and flags the ones stale for more than N business days', async () => {
    const body = MyWorkResponseSchema.parse((await get('/api/me/work', 'carla').expect(200)).body)
    expect(body.staleAfterBusinessDays).toBe(3)
    if (body.jira.state !== 'ready') throw new Error('expected Jira data')
    expect(keys(body.jira.inProgress)).toEqual(['OPS-1', 'LAB-1'])
    expect(keys(body.jira.review)).toEqual(['LAB-2'])
    expect(keys(body.jira.blocked)).toEqual(['LAB-3'])
    expect(keys(body.jira.stale)).toEqual(['LAB-2', 'OPS-1'])
    expect(
      Object.fromEntries(
        [...body.jira.inProgress, ...body.jira.review, ...body.jira.blocked].map((item) => [
          item.key,
          item.idleBusinessDays,
        ]),
      ),
    ).toEqual({ 'OPS-1': 4.5, 'LAB-1': 1, 'LAB-2': 5, 'LAB-3': 2 })
    expect(body.jira.review[0]).toMatchObject({
      url: 'https://jira.example.test/browse/LAB-2',
      since: '2026-11-13T12:00:00.000Z',
      stale: true,
    })
  })

  it('takes the stale threshold from the query, counting only more than N days', async () => {
    const four = MyWorkResponseSchema.parse(
      (await get('/api/me/work?staleDays=4', 'carla').expect(200)).body,
    )
    expect(four.jira.state === 'ready' && keys(four.jira.stale)).toEqual(['LAB-2', 'OPS-1'])
    const five = MyWorkResponseSchema.parse(
      (await get('/api/me/work?staleDays=5', 'carla').expect(200)).body,
    )
    expect(five.staleAfterBusinessDays).toBe(5)
    expect(five.jira.state === 'ready' && five.jira.stale).toEqual([])
    await get('/api/me/work?staleDays=0', 'carla').expect(400)
    await get('/api/me/work?staleDays=31', 'carla').expect(400)
  })

  it('lists what depends on me: reviews, items I block and PRs with changes requested', async () => {
    const body = MyWorkResponseSchema.parse((await get('/api/me/work', 'carla').expect(200)).body)
    if (body.jira.state !== 'ready' || body.review.state !== 'ready') throw new Error('expected')
    expect(
      body.jira.blockedByMe.map((item) => [item.key, item.assignee, item.blocker.key]),
    ).toEqual([
      ['LAB-4', 'Bruno Tavares', 'LAB-1'],
      ['LAB-8', 'Pessoa Externa', 'LAB-2'],
    ])
    expect(body.review.toReview).toEqual([
      expect.objectContaining({ number: 1, author: 'Bruno Tavares', level: 'atrasado' }),
    ])
    expect(body.review.mine.map((pr) => pr.status.kind)).toEqual([
      'failing_checks',
      'bot_changes',
      'reviewed',
      'awaiting_review',
    ])
    expect(body.review.changesRequested.map((pr) => pr.number)).toEqual([3, 4])
  })

  it('raises alerts for today, most severe first', async () => {
    const body = MyWorkResponseSchema.parse((await get('/api/me/work', 'carla').expect(200)).body)
    expect(body.alerts.map((alert) => [alert.kind, alert.severity])).toEqual([
      ['blocking_others', 'alta'],
      ['blocking_others', 'alta'],
      ['blocked_task', 'alta'],
      ['late_review', 'alta'],
      ['stale_task', 'media'],
      ['stale_task', 'media'],
      ['failing_checks', 'media'],
    ])
    expect(body.alerts[0]?.message).toBe('LAB-1 segura LAB-4 de Bruno Tavares.')
    expect(body.alerts[4]?.message).toBe('LAB-2 está parada em Code Review há 5,0 dias úteis.')
  })

  it('explains why the Jira part is missing for people outside the catalog or without account', async () => {
    const nobody = MyWorkResponseSchema.parse(
      (await get('/api/me/work', 'nobody').expect(200)).body,
    )
    expect(nobody.person).toBeNull()
    expect(nobody.jira).toEqual({ state: 'unavailable', reason: 'unknown_person' })
    expect(nobody.review).toMatchObject({ state: 'ready', github: 'nobody', toReview: [] })
    const davi = MyWorkResponseSchema.parse((await get('/api/me/work', 'davi').expect(200)).body)
    expect(davi.review).toEqual({ state: 'unavailable', reason: 'no_github_account' })
    expect(davi.jira.state).toBe('ready')
  })

  it('serves my review queue by the GitHub login linked to the portal login', async () => {
    const queue = await get('/api/me/review', 'carla').expect(200)
    expect(queue.body.toReview.map((r: { number: number }) => r.number)).toEqual([1])
    expect(queue.body.mine).toHaveLength(4)
  })
})

describe('team work', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await startWorkApp(fakeWork(workDataset()))
  })
  afterAll(() => app.close())

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)

  it('answers 403 to devs, inside or outside the catalog', async () => {
    const denied = await get('/api/team/work', 'carla').expect(403)
    expect(denied.body.message).toBe('Only leads and admins see the team view')
    await get('/api/team/work?team=campanhas', 'nobody').expect(403)
  })

  it('shows the load of each person of the lead team with the stale items', async () => {
    const body = TeamWorkResponseSchema.parse((await get('/api/team/work', 'ana').expect(200)).body)
    expect(body.team).toEqual({ id: 'campanhas', name: 'Campanhas' })
    expect(body.teams.map((team) => team.id)).toEqual(['campanhas', 'dados'])
    expect(body.members).toEqual([
      {
        login: 'ana.figueira',
        name: 'Ana Figueira',
        role: 'lead',
        jira: { inProgress: 0, review: 0, blocked: 0, stale: 0 },
        pendingReviews: 1,
      },
      {
        login: 'bruno.tavares',
        name: 'Bruno Tavares',
        role: 'dev',
        jira: { inProgress: 1, review: 0, blocked: 1, stale: 1 },
        pendingReviews: 1,
      },
      {
        login: 'carla.mendes',
        name: 'Carla Mendes',
        role: 'dev',
        jira: { inProgress: 2, review: 1, blocked: 1, stale: 2 },
        pendingReviews: 1,
      },
      {
        login: 'davi.prado',
        name: 'Davi Prado',
        role: 'dev',
        jira: { inProgress: 0, review: 0, blocked: 0, stale: 0 },
        pendingReviews: null,
      },
    ])
    expect(body.jira.state === 'ready' && body.jira.staleItems).toEqual([
      expect.objectContaining({ key: 'LAB-2', assignee: 'Carla Mendes' }),
      expect.objectContaining({ key: 'OPS-1', assignee: 'Carla Mendes' }),
      expect.objectContaining({ key: 'LAB-5', assignee: 'Bruno Tavares' }),
    ])
  })

  it('never ranks people: alphabetical order and no score in the answer', async () => {
    const response = await get('/api/team/work', 'ana').expect(200)
    const body = TeamWorkResponseSchema.parse(response.body)
    const names = body.members.map((member) => member.name)
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, 'pt-BR')))
    for (const member of response.body.members as Record<string, unknown>[]) {
      expect(Object.keys(member).sort()).toEqual([
        'jira',
        'login',
        'name',
        'pendingReviews',
        'role',
      ])
    }
    expect(JSON.stringify(response.body)).not.toMatch(/score|rank|nota|position|productivity/i)
  })

  it('lets admins pick any team and validates the team', async () => {
    const first = TeamWorkResponseSchema.parse(
      (await get('/api/team/work', 'admin').expect(200)).body,
    )
    expect(first.team.id).toBe('campanhas')
    const dados = TeamWorkResponseSchema.parse(
      (await get('/api/team/work?team=dados', 'admin').expect(200)).body,
    )
    expect(dados.members.map((member) => member.login)).toEqual(['elisa.rocha'])
    await get('/api/team/work?team=nope', 'admin').expect(404)
    await get('/api/team/work?team=Not%20A%20Team', 'admin').expect(400)
  })
})

describe('work without the Jira mirror', () => {
  it('keeps reviews and PRs and says the database is missing', async () => {
    const app = await startWorkApp(null)
    const server = app.getHttpServer()
    const mine = MyWorkResponseSchema.parse(
      (await request(server).get('/api/me/work').set('Authorization', 'Bearer carla').expect(200))
        .body,
    )
    expect(mine.jira).toEqual({ state: 'unavailable', reason: 'no_database' })
    expect(mine.review.state).toBe('ready')
    expect(mine.alerts.map((alert) => alert.kind)).toEqual(['late_review', 'failing_checks'])
    const team = TeamWorkResponseSchema.parse(
      (await request(server).get('/api/team/work').set('Authorization', 'Bearer ana').expect(200))
        .body,
    )
    expect(team.jira).toEqual({ state: 'unavailable', reason: 'no_database' })
    expect(team.members.every((member) => member.jira === null)).toBe(true)
    await app.close()
  })

  it('says the collector has not run yet and survives missing review data', async () => {
    const app = await startWorkApp(fakeWork(null), { PORTAL_PANEL_DATA: '/nope/data.json' })
    const server = app.getHttpServer()
    const mine = MyWorkResponseSchema.parse(
      (await request(server).get('/api/me/work').set('Authorization', 'Bearer carla').expect(200))
        .body,
    )
    expect(mine.jira).toEqual({ state: 'unavailable', reason: 'not_collected' })
    expect(mine.review).toEqual({ state: 'unavailable', reason: 'not_collected' })
    expect(mine.alerts).toEqual([])
    const team = TeamWorkResponseSchema.parse(
      (await request(server).get('/api/team/work').set('Authorization', 'Bearer ana').expect(200))
        .body,
    )
    expect(team.review).toEqual({ state: 'unavailable' })
    expect(team.members.every((member) => member.pendingReviews === null)).toBe(true)
    await app.close()
  })
})

describe('people catalog', () => {
  it('loads the versioned catalog with fictitious people', () => {
    const directory = loadPeopleDirectory(CATALOG)
    expect(directory.teams.length).toBeGreaterThan(0)
    expect(directory.people.every((person) => !person.login.includes('@'))).toBe(true)
    expect(directory.members(directory.teams[0]?.id ?? '').length).toBeGreaterThan(0)
  })

  it('treats a missing folder as nobody linked and fails on invalid or repeated entries', async () => {
    expect(loadPeopleDirectory('/nope/people').people).toEqual([])
    const invalid = await writePeople({ 'x.yaml': 'team: X\nname: x\npeople: []' })
    expect(() => loadPeopleDirectory(invalid)).toThrow('Catálogo de pessoas inválido em x.yaml')
    const repeatedTeam = await writePeople({ 'a.yaml': DADOS, 'b.yaml': DADOS })
    expect(() => loadPeopleDirectory(repeatedTeam)).toThrow('repete o time dados')
    const repeatedGithub = await writePeople({
      'a.yaml': DADOS,
      'b.yaml': `team: outro\nname: Outro\npeople:\n  - { login: outra, name: Outra, github: ELISA }`,
    })
    expect(() => loadPeopleDirectory(repeatedGithub)).toThrow('repete github ELISA')
  })

  it('names unknown accounts by the account itself', async () => {
    const directory = loadPeopleDirectory(await writePeople({ 'c.yaml': CAMPANHAS }))
    expect(directory.nameOf('BRUNO', 'jira')).toBe('Bruno Tavares')
    expect(directory.nameOf('zé', 'github')).toBe('zé')
    expect(directory.nameOf(null, 'github')).toBeNull()
  })
})

describe('database work data', () => {
  type Repository = Pick<JiraRepository, 'listIssues' | 'listStatusChanges' | 'listIssueLinks'>
  const repository = (overrides: Partial<Repository> = {}): Repository => ({
    listIssues: () => Promise.resolve([{ ...issue('LAB-1', {}), sprintId: null }]),
    listStatusChanges: () => Promise.resolve([]),
    listIssueLinks: () => Promise.resolve([]),
    ...overrides,
  })

  it('reads the mirror and treats an empty or missing mirror as not collected', async () => {
    expect((await new DatabaseWorkData(repository()).load())?.issues).toHaveLength(1)
    const empty = new DatabaseWorkData(repository({ listIssues: () => Promise.resolve([]) }))
    expect(await empty.load()).toBeNull()
    const missing = new DatabaseWorkData(
      repository({
        listIssueLinks: () => Promise.reject(Object.assign(new Error('x'), { code: '42P01' })),
      }),
    )
    expect(await missing.load()).toBeNull()
    const broken = new DatabaseWorkData(
      repository({ listIssues: () => Promise.reject(new Error('connection lost')) }),
    )
    await expect(broken.load()).rejects.toThrow('connection lost')
    await broken.onModuleDestroy()
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('my work on Postgres', () => {
  let db: IsolatedSchema
  let app: INestApplication

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
    const repository = new JiraRepository(db.pool)
    const dataset = workDataset()
    await repository.upsertIssues(dataset.issues.map((item) => ({ ...item, sprintId: null })))
    await repository.addStatusChanges(dataset.changes)
    await repository.replaceIssueLinks(
      dataset.issues.map((item) => item.key),
      dataset.links,
    )
    app = await startWorkApp(createWorkData({ kind: 'database', url: db.connectionString }))
  })

  afterAll(async () => {
    await app.close()
    await db.drop()
  })

  it('reads tasks and blocking links from the Jira mirror', async () => {
    const body = MyWorkResponseSchema.parse(
      (
        await request(app.getHttpServer())
          .get('/api/me/work')
          .set('Authorization', 'Bearer carla')
          .expect(200)
      ).body,
    )
    if (body.jira.state !== 'ready') throw new Error('expected Jira data')
    expect(keys(body.jira.stale)).toEqual(['LAB-2', 'OPS-1'])
    expect(keys(body.jira.blockedByMe)).toEqual(['LAB-4', 'LAB-8'])
  })
})
