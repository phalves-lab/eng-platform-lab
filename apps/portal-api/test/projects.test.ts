import 'reflect-metadata'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ProjectDetailSchema, ProjectSummarySchema, SystemRelationsSchema } from '@lab/contracts'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { MODEL_PROVIDER } from '../src/ask/model/model-provider.js'
import { loadConfig } from '../src/config/config.js'
import { JIRA_DATA, type JiraData } from '../src/flow/jira-data.js'
import { loadProjectCatalog } from '../src/projects/catalog.js'
import { PROJECTS_CLOCK } from '../src/projects/projects.service.js'
import { FakeProvider, call } from './fake-provider.js'
import { HANDBOOK, NOW, fakeData, flowDataset } from './flow-fixtures.js'

const queueRow = (overrides: Record<string, unknown>) => ({
  position: 1,
  number: 1,
  title: 'feat: item',
  url: 'https://example.invalid/pr/1',
  author: 'ana',
  taskKey: null,
  taskStatus: null,
  requestedReviewers: [],
  reviewedBy: [],
  enteredAt: '2026-11-19T10:00:00.000Z',
  enteredFrom: 'pr',
  ageBusinessDays: 1,
  level: 'ok',
  hasHumanReview: false,
  checks: 'SUCCESS',
  botSignal: null,
  risks: [],
  lines: 10,
  ...overrides,
})

const writePanel = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'projects-panel-'))
  const path = join(dir, 'data.json')
  const queue = [
    queueRow({
      number: 7,
      title: 'feat: limite de orçamento',
      url: 'https://github.com/lab-demo/campanhas-api/pull/7',
      enteredAt: '2026-11-18T10:00:00.000Z',
    }),
    queueRow({ number: 8, title: 'fix: LAB-2 destrava item', taskKey: 'LAB-2' }),
    queueRow({ number: 9, url: 'https://github.com/lab-demo/outro/pull/9', taskKey: 'OPS-77' }),
  ]
  const dataset = { id: 'lab', title: 'Lab', label: 'Lab', generatedAt: NOW.toISOString(), queue }
  const copy = { ...dataset, id: 'demo', queue: [queue[0]] }
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, generatedAt: NOW.toISOString(), datasets: [dataset, copy] }),
  )
  return path
}

const PROJECTS: Record<string, string> = {
  'epico-sintetico.yaml': [
    'id: epico-sintetico',
    'name: Épico sintético do laboratório',
    'objective: Medir o cruzamento do catálogo com o Jira, os PRs e o DORA.',
    'status: at_risk',
    "owner: '@lab/platform'",
    'epic: LAB-9',
    'repos: [lab-demo/campanhas-api]',
    'systems: [Bot de review, bot-de-review, Sistema fantasma]',
    'decisions: [ENG-PR-03, eng-qa-01, XX-1]',
    'risks:',
    '  - title: Item bloqueado sem dono',
    '    severity: high',
  ].join('\n'),
  'sem-espelho.yaml': [
    'id: sem-espelho',
    'name: Projeto fora do espelho',
    'objective: Ter épico que o Jira ainda não coletou.',
    'status: planned',
    "owner: '@lab/ops'",
    'epic: OPS-404',
  ].join('\n'),
}

const writeProjects = async (files: Record<string, string> = PROJECTS) => {
  const dir = await mkdtemp(join(tmpdir(), 'projects-'))
  await Promise.all(
    Object.entries(files).map(([file, content]) => writeFile(join(dir, file), content)),
  )
  return dir
}

interface StartOptions {
  jira: JiraData | null
  env?: Record<string, string>
  provider?: FakeProvider
}

const start = async ({ jira, env = {}, provider }: StartOptions) => {
  const builder = Test.createTestingModule({
    imports: [
      AppModule.register(
        loadConfig({
          NODE_ENV: 'test',
          PORTAL_HANDBOOK_DIR: HANDBOOK,
          PORTAL_PANEL_DATA: '/nonexistent/data.json',
          PORTAL_PROJECTS_DIR: await writeProjects(),
          ...env,
        }),
      ),
    ],
  })
    .overrideProvider(JIRA_DATA)
    .useValue(jira)
    .overrideProvider(PROJECTS_CLOCK)
    .useValue(() => NOW)
  if (provider) builder.overrideProvider(MODEL_PROVIDER).useValue(provider)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return app
}

describe('projetos cruzados com Jira, fila de review e DORA', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({
      jira: fakeData(flowDataset()),
      env: { PORTAL_PANEL_DATA: await writePanel() },
    })
  })
  afterAll(() => app.close())

  it('lista os projetos com progresso do épico e PRs abertos', async () => {
    const response = await request(app.getHttpServer()).get('/api/projects').expect(200)
    const body = ProjectSummarySchema.array().parse(response.body)
    expect(body.map((project) => project.id)).toEqual(['epico-sintetico', 'sem-espelho'])
    expect(body[0]).toMatchObject({
      status: 'at_risk',
      epicKey: 'LAB-9',
      epic: { key: 'LAB-9', total: 2, done: 1, open: 1, blocked: 1, percent: 50 },
      openPullRequests: 2,
      sources: { jira: 'ok', pullRequests: 'ok' },
    })
    expect(body[1]).toMatchObject({ epic: null, openPullRequests: 0 })
  })

  it('filtra a lista por termo sem acento e sem caixa', async () => {
    const server = app.getHttpServer()
    const found = await request(server).get('/api/projects?term=ESPELHO').expect(200)
    expect(found.body.map((project: { id: string }) => project.id)).toEqual(['sem-espelho'])
    const byRepo = await request(server).get('/api/projects?term=campanhas-api').expect(200)
    expect(byRepo.body).toHaveLength(1)
    expect((await request(server).get('/api/projects?term=zzz').expect(200)).body).toEqual([])
    await request(server)
      .get(`/api/projects?term=${'x'.repeat(81)}`)
      .expect(400)
  })

  it('detalha épico, tasks, PRs, deploys, DORA, sistemas, decisões e riscos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/projects/epico-sintetico')
      .expect(200)
    const body = ProjectDetailSchema.parse(response.body)
    expect(body.sources).toEqual({ jira: 'ok', pullRequests: 'ok', dora: 'ok' })
    expect(body.generatedAt).toBe(NOW.toISOString())
    expect(body.tasks.map((task) => [task.key, task.category])).toEqual([
      ['LAB-2', 'blocked'],
      ['LAB-1', 'done'],
    ])
    expect(body.pullRequests.open.map((pr) => [pr.number, pr.repo, pr.taskKey])).toEqual([
      [8, null, 'LAB-2'],
      [7, 'lab-demo/campanhas-api', null],
    ])
    expect(body.pullRequests.merged.length).toBeGreaterThan(0)
    expect(body.pullRequests.merged.length).toBeLessThanOrEqual(10)
    expect(body.pullRequests.merged.every((pr) => pr.repo === 'lab-demo/campanhas-api')).toBe(true)
    expect(body.pullRequests.merged[0]?.at).toBe('2026-11-20T17:12:00.000Z')
    expect(body.deploys.length).toBeGreaterThan(0)
    expect(body.deploys.every((deploy) => deploy.repo === 'lab-demo/campanhas-api')).toBe(true)
    expect(body.dora.map((repo) => repo.repo)).toEqual(['lab-demo/campanhas-api'])
    expect(body.systems).toEqual([
      expect.objectContaining({
        name: 'Bot de review',
        slug: 'bot-de-review',
        owner: 'time platform.',
      }),
      expect.objectContaining({ name: 'Bot de review', slug: 'bot-de-review' }),
      { name: 'Sistema fantasma', slug: null, status: null, owner: null, summary: null },
    ])
    expect(body.decisions.map((decision) => [decision.id, decision.kind])).toEqual([
      ['ENG-PR-03', 'decision'],
      ['ENG-QA-01', 'standard'],
      ['XX-1', 'unknown'],
    ])
    expect(body.decisions[0]?.priority).toBe(1)
    expect(body.risks).toEqual([
      { title: 'Item bloqueado sem dono', severity: 'high', mitigation: null },
    ])
  })

  it('responde 404 para projeto desconhecido e 400 para id inválido', async () => {
    const server = app.getHttpServer()
    await request(server).get('/api/projects/nao-existe').expect(404)
    await request(server).get('/api/projects/Fora_Do_Padrao').expect(400)
  })
})

describe('projetos sem dados coletados', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({ jira: null })
  })
  afterAll(() => app.close())

  it('marca Jira e fila como indisponíveis sem derrubar a lista nem o detalhe', async () => {
    const server = app.getHttpServer()
    const list = await request(server).get('/api/projects').expect(200)
    expect(list.body[0]).toMatchObject({
      epic: null,
      openPullRequests: null,
      sources: { jira: 'unavailable', pullRequests: 'unavailable' },
    })
    const detail = ProjectDetailSchema.parse(
      (await request(server).get('/api/projects/epico-sintetico').expect(200)).body,
    )
    expect(detail.sources).toEqual({ jira: 'unavailable', pullRequests: 'unavailable', dora: 'ok' })
    expect(detail.tasks).toEqual([])
    expect(detail.pullRequests.open).toEqual([])
  })
})

describe('catálogo de projetos', () => {
  it('lê o catálogo versionado do laboratório', () => {
    const projects = loadProjectCatalog(join(HANDBOOK, '../catalog/projects'))
    expect(projects.map((project) => project.entry.id)).toEqual([
      'alertas-de-campanhas',
      'metricas-de-fluxo',
      'reprocessamento-de-filas',
    ])
    expect(projects[0]?.source).toBe('catalog/projects/alertas-de-campanhas.yaml')
  })

  it('trata pasta ausente como catálogo vazio e falha com o nome do arquivo inválido', async () => {
    expect(loadProjectCatalog('/nonexistent/projects')).toEqual([])
    const invalid = await writeProjects({ 'a.yaml': 'id: a\nname: A\nstatus: talvez\n' })
    expect(() => loadProjectCatalog(invalid)).toThrow(/Catálogo de projetos inválido em a\.yaml/)
    const renamed = await writeProjects({ 'outro.yaml': PROJECTS['sem-espelho.yaml'] ?? '' })
    expect(() => loadProjectCatalog(renamed)).toThrow(/outro\.yaml declara o id sem-espelho/)
  })
})

describe('relações da ficha de sistema', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({ jira: null })
  })
  afterAll(() => app.close())

  it('devolve dono, eventos dos dois lados com link e o módulo do catálogo', async () => {
    const server = app.getHttpServer()
    const api = SystemRelationsSchema.parse(
      (await request(server).get('/api/handbook/systems/api-de-solicitacoes-de-campanha/relations'))
        .body,
    )
    expect(api.owner).toBe('time api-owners.')
    expect(api.produces.map((event) => event.event)).toEqual([
      'solicitacao.criada',
      'solicitacao.aprovada',
      'solicitacao.rejeitada',
    ])
    expect(api.produces[1]?.peers).toEqual([
      { name: 'Worker de notificações', slug: 'worker-de-notificacoes' },
      { name: 'Worker do portal', slug: 'worker-do-portal' },
    ])
    expect(api.consumes).toEqual([
      expect.objectContaining({
        topic: 'notificacoes.envios',
        peers: [{ name: 'Worker de notificações', slug: 'worker-de-notificacoes' }],
      }),
    ])
    expect(api).toMatchObject({
      moduleId: 'campaign-requests',
      module: { name: 'campaign-requests', tier: 'tier-1', paths: ['apps/api/'] },
    })
    const worker = (
      await request(server).get('/api/handbook/systems/worker-de-notificacoes/relations')
    ).body
    expect(worker).toMatchObject({ moduleId: null, module: null })
    const bot = (await request(server).get('/api/handbook/systems/bot-de-review/relations')).body
    expect(bot).toMatchObject({ produces: [], consumes: [], moduleId: 'review-bot' })
    await request(server).get('/api/handbook/systems/kafka/relations').expect(404)
  })

  it('mostra o módulo citado que não existe no catálogo como ligação quebrada', async () => {
    const modules = await mkdtemp(join(tmpdir(), 'modules-'))
    const isolated = await start({ jira: null, env: { PORTAL_MODULES_DIR: modules } })
    const body = (
      await request(isolated.getHttpServer()).get('/api/handbook/systems/bot-de-review/relations')
    ).body
    expect(body).toMatchObject({ moduleId: 'review-bot', module: null })
    await isolated.close()
  })
})

describe('ferramenta projeto no chat', () => {
  const fake = new FakeProvider()
  let app: INestApplication

  const LLM_ENV = {
    PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1/',
    PORTAL_LLM_API_KEY: 'test-key',
    PORTAL_LLM_MODEL: 'modelo-sintetico',
  }

  const toolOutputs = () =>
    fake.requests
      .flatMap((entry) => entry.messages)
      .flatMap((message) => (message.role === 'tool' ? [message.content] : []))

  const ask = (question: string) =>
    request(app.getHttpServer()).post('/api/ask/stream').send({ question }).buffer(true).expect(200)

  beforeAll(async () => {
    app = await start({
      jira: fakeData(flowDataset()),
      env: { ...LLM_ENV, PORTAL_PANEL_DATA: await writePanel() },
      provider: fake,
    })
  })
  afterAll(() => app.close())

  it('oferece a ferramenta e responde a situação do projeto com fonte e citações', async () => {
    fake.play(
      { toolCalls: [call('projeto', { projeto: 'épico sintético' })] },
      { text: ['O Épico sintético do laboratório está em risco.'] },
    )
    const response = await ask('Como está o épico sintético?')
    expect(fake.requests[0]?.tools.map((tool) => tool.name)).toContain('projeto')
    const [output] = toolOutputs()
    expect(output).toContain('Épico sintético do laboratório (epico-sintetico), em risco')
    expect(output).toContain('Épico LAB-9: 1 de 2 itens concluídos (50%), 1 abertos, 1 bloqueados.')
    expect(output).toContain('PRs abertos: 2.')
    expect(output).toContain('Sistemas: Bot de review, Bot de review, Sistema fantasma (sem ficha)')
    expect(output).toContain('Risco alta: Item bloqueado sem dono')
    expect(output).toMatch(/Fonte: catalog\/projects\/epico-sintetico\.yaml$/)
    expect(response.text).toContain('"label":"Épico sintético do laboratório"')
  })

  it('lista os projetos quando não acha e avisa épico fora do espelho', async () => {
    fake.play(
      {
        toolCalls: [
          call('projeto', { projeto: 'inexistente' }, 'a'),
          call('projeto', { projeto: 'sem-espelho' }, 'b'),
          call('projeto', { projeto: 'x' }, 'c'),
        ],
      },
      { text: ['Pronto.'] },
    )
    await ask('E os outros projetos?')
    const [missing, outside, invalid] = toolOutputs()
    expect(missing).toBe(
      'Projeto "inexistente" não encontrado. Projetos do catálogo: Épico sintético do laboratório (epico-sintetico), Projeto fora do espelho (sem-espelho).',
    )
    expect(outside).toContain('Épico OPS-404: não está no espelho do Jira.')
    expect(outside).toContain('Riscos: nenhum cadastrado')
    expect(outside).toContain('Decisões ligadas: nenhuma')
    expect(invalid).toContain('Argumentos inválidos para projeto')
  })

  it('devolve aviso ao modelo quando a leitura do projeto falha', async () => {
    const broken: JiraData = {
      projects: () => Promise.resolve([]),
      load: () => Promise.reject(new Error('conexão recusada')),
    }
    const failing = await start({ jira: broken, env: LLM_ENV, provider: fake })
    fake.play({ toolCalls: [call('projeto', { projeto: 'sem-espelho' })] }, { text: ['Ok.'] })
    await request(failing.getHttpServer())
      .post('/api/ask/stream')
      .send({ question: 'Como está o projeto fora do espelho?' })
      .buffer(true)
      .expect(200)
    expect(toolOutputs()).toEqual(['A ferramenta projeto falhou agora. Tente de novo mais tarde.'])
    await failing.close()
  })
})
