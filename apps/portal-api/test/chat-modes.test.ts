import 'reflect-metadata'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import {
  type AskStreamEvent,
  AskStreamEventSchema,
  ChatModesResponseSchema,
  ModeChatRequestSchema,
  createSseParser,
} from '@lab/contracts'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { DRAFT_MODE_IDS, toolNamesOf } from '../src/ask/modes/mode-definitions.js'
import { loadModePrompts } from '../src/ask/modes/mode-prompts.js'
import { skillLookup } from '../src/ask/modes/skill-lookup.js'
import { MODEL_PROVIDER } from '../src/ask/model/model-provider.js'
import { createPortalTools, type PortalReaders } from '../src/ask/tools/portal-tools.js'
import { TaskFixtures } from '../src/ask/tools/task-fixtures.js'
import { loadConfig } from '../src/config/config.js'
import { FakeProvider, call } from './fake-provider.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))
const TASKS = fileURLToPath(new URL('../../../fixtures/jira', import.meta.url))

const BASE_ENV = {
  NODE_ENV: 'test',
  PORTAL_HANDBOOK_DIR: HANDBOOK,
  PORTAL_PANEL_DATA: '/nope/data.json',
}

const LLM_ENV = {
  ...BASE_ENV,
  PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1/',
  PORTAL_LLM_API_KEY: 'test-key',
  PORTAL_LLM_MODEL: 'modelo-sintetico',
  PORTAL_LLM_MAX_TOOL_ROUNDS: '2',
  PORTAL_LLM_TIMEOUT_MS: '500',
}

const start = async (env: Record<string, string>, provider?: FakeProvider) => {
  const builder = Test.createTestingModule({ imports: [AppModule.register(loadConfig(env))] })
  if (provider) builder.overrideProvider(MODEL_PROVIDER).useValue(provider)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return app
}

const streamIn = async (app: INestApplication, body: object) => {
  const res = await request(app.getHttpServer())
    .post('/api/ask/stream')
    .send(body)
    .buffer(true)
    .expect(200)
  return createSseParser()(res.text).map((data) => AskStreamEventSchema.parse(JSON.parse(data)))
}

const doneOf = (events: AskStreamEvent[]) => {
  const done = events.at(-1)
  if (done?.type !== 'done') throw new Error(`last event is ${done?.type}`)
  return done.response
}

const toolNames = (fake: FakeProvider, index = 0) =>
  fake.requests[index]?.tools.map((tool) => tool.name) ?? []

const toolMessages = (fake: FakeProvider, index: number) =>
  fake.requests[index]?.messages.flatMap((message) =>
    message.role === 'tool' ? [message.content] : [],
  ) ?? []

const systemPrompt = (fake: FakeProvider) => {
  const first = fake.requests[0]?.messages[0]
  return first?.role === 'system' ? first.content : ''
}

describe('modos do chat', () => {
  const fake = new FakeProvider()
  let app: INestApplication

  beforeAll(async () => {
    app = await start(LLM_ENV, fake)
  })
  beforeEach(() => fake.play())
  afterAll(() => app.close())

  it('lista os seis modos com a skill do marketplace de cada um', async () => {
    const res = await request(app.getHttpServer()).get('/api/ask/modes').expect(200)
    const { modes } = ChatModesResponseSchema.parse(res.body)
    expect(modes.map((mode) => mode.id)).toEqual(['ask', ...DRAFT_MODE_IDS])
    expect(modes.every((mode) => mode.available)).toBe(true)
    expect(modes.filter((mode) => mode.draft).map((mode) => mode.id)).toEqual(DRAFT_MODE_IDS)
    expect(modes.find((mode) => mode.id === 'refine-task')?.skill).toMatchObject({
      plugin: 'lab-grill',
      skill: 'grill',
      found: true,
      description: expect.stringContaining('uma pergunta por vez'),
    })
    expect(modes.find((mode) => mode.id === 'release-notes')?.skill).toMatchObject({
      plugin: 'lab-changelog',
      found: true,
    })
    expect(modes.find((mode) => mode.id === 'ask')).toMatchObject({ maxLength: 500, skill: null })
  })

  it('refina a task com o prompt do modo, a skill de referência e a ferramenta tarefa', async () => {
    fake.play(
      { toolCalls: [call('tarefa', { chave: 'LAB-53' })] },
      { text: ['**Critérios de aceite**\n- Plano antes da escrita.'] },
    )
    const events = await streamIn(app, { mode: 'refine-task', question: 'Refine a task LAB-53' })

    expect(events.map((event) => event.type)).toEqual(['start', 'tool', 'delta', 'done'])
    expect(doneOf(events)).toMatchObject({ mode: 'llm', answer: expect.stringContaining('Plano') })
    const prompt = systemPrompt(fake)
    expect(prompt).toContain('# Regras comuns dos rascunhos')
    expect(prompt).toContain('# Modo Refinar task')
    expect(prompt).toContain('skill `grill` do plugin `lab-grill`')
    expect(toolNames(fake)).toEqual(toolNamesOf('refine-task'))
    expect(toolNames(fake)).toContain('tarefa')
    expect(toolNames(fake)).not.toContain('metricas_review')
    expect(toolMessages(fake, 1)[0]).toContain('LAB-53 · Gerar a release pelo portal')
    expect(toolMessages(fake, 1)[0]).toContain('Critérios de aceite:\n- Porta GitHubWriter')
  })

  it('monta a descrição de PR com o template do repositório no prompt', async () => {
    fake.play({ text: ['Título: feat(portal): x'] })
    await streamIn(app, {
      mode: 'pr-description',
      question: 'Título: feat(portal): x. Task: LAB-51. Diff: tela nova.',
    })
    const prompt = systemPrompt(fake)
    expect(prompt).toContain('## Contexto de negócio')
    expect(prompt).toContain('npm run verify')
    expect(prompt).not.toContain('{{pull_request_template}}')
  })

  it('dá ao resumo da semana só as métricas, e cada uma diz quando não tem dado', async () => {
    fake.play(
      {
        toolCalls: [
          call('metricas_review', {}, 'r'),
          call('metricas_fluxo', { projeto: 'LAB' }, 'f'),
          call('metricas_dora', { time: 'Plataforma' }, 'd'),
        ],
      },
      { text: ['Resumo.'] },
    )
    await streamIn(app, { mode: 'weekly-summary', question: 'Resumo da semana do time' })

    expect(toolNames(fake)).toEqual(['metricas_review', 'metricas_fluxo', 'metricas_dora'])
    const [review, flow, dora] = toolMessages(fake, 1)
    expect(review).toContain('Não foi possível ler metricas_review agora')
    expect(flow).toContain('Não foi possível ler metricas_fluxo agora: Jira data is not available')
    expect(JSON.parse(dora ?? '{}')).toMatchObject({ filtro: { team: 'Plataforma' } })
  })

  it('aceita rascunho longo e recusa pergunta longa no modo Perguntar', async () => {
    fake.play({ text: ['Rascunho.'] })
    const long = `Refine: ${'texto da task '.repeat(150)}`
    expect(long.length).toBeGreaterThan(500)
    await streamIn(app, { mode: 'refine-task', question: long })
    await request(app.getHttpServer()).post('/api/ask/stream').send({ question: long }).expect(400)
    await request(app.getHttpServer())
      .post('/api/ask/stream')
      .send({ mode: 'publicar-no-jira', question: 'Publique isto' })
      .expect(400)
  })

  it('mascara dado pessoal do texto colado antes de mandar ao modelo', async () => {
    fake.play({ text: ['Rascunho.'] })
    await streamIn(app, {
      mode: 'pr-description',
      question: 'Título: feat: x. Dúvidas com ana.souza@exemplo.com, CPF 123.456.789-09.',
    })
    const sent = JSON.stringify(fake.requests[0]?.messages)
    expect(sent).not.toContain('ana.souza@exemplo.com')
    expect(sent).not.toContain('123.456.789-09')
    expect(sent).toContain('[e-mail]')
  })

  it('avisa que o rascunho não saiu quando o modelo falha antes de escrever', async () => {
    fake.play({ fail: 'gateway 500' })
    const events = await streamIn(app, { mode: 'adr', question: 'Dev: vamos trocar o modelo?' })
    expect(doneOf(events)).toEqual({
      mode: 'retrieval',
      answer: 'O modelo não respondeu agora e o rascunho não foi gerado. Tente de novo.',
      sources: [],
    })
  })
})

describe('modos do chat sem modelo', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start(BASE_ENV)
  })
  afterAll(() => app.close())

  it('marca os rascunhos como indisponíveis e responde com aviso em vez de busca', async () => {
    const res = await request(app.getHttpServer()).get('/api/ask/modes').expect(200)
    const { modes } = ChatModesResponseSchema.parse(res.body)
    expect(modes.filter((mode) => mode.available).map((mode) => mode.id)).toEqual(['ask'])

    const events = await streamIn(app, { mode: 'release-notes', question: '#1 feat: x (LAB-1)' })
    const response = doneOf(events)
    expect(response).toMatchObject({ mode: 'retrieval', sources: [] })
    expect(response.answer).toContain('Os rascunhos precisam do modelo de IA')
  })
})

describe('contrato do pedido com modo', () => {
  it('usa Perguntar por padrão e limita a pergunta só nesse modo', () => {
    expect(ModeChatRequestSchema.parse({ question: 'Qual o padrão?' }).mode).toBe('ask')
    const draft = 'x'.repeat(2000)
    expect(ModeChatRequestSchema.safeParse({ question: draft, mode: 'adr' }).success).toBe(true)
    expect(ModeChatRequestSchema.safeParse({ question: draft }).success).toBe(false)
    expect(
      ModeChatRequestSchema.safeParse({ question: 'x'.repeat(8001), mode: 'adr' }).success,
    ).toBe(false)
  })
})

describe('prompts dos modos', () => {
  it('lê um prompt versionado por modo de rascunho, com as regras comuns', async () => {
    const prompts = await loadModePrompts()
    expect(Object.keys(prompts).sort()).toEqual([...DRAFT_MODE_IDS].sort())
    for (const id of DRAFT_MODE_IDS) {
      expect(prompts[id]).toMatch(/^# Regras comuns dos rascunhos/)
      expect(prompts[id]).toContain('Tudo é rascunho')
    }
  })

  it('falha quando falta o prompt de um modo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mode-prompts-'))
    await mkdir(join(dir, 'modes'))
    await writeFile(join(dir, 'draft-rules.md'), '# Regras')
    await expect(loadModePrompts({ promptsDir: pathToFileURL(`${dir}/`) })).rejects.toThrow(
      'ENOENT',
    )
  })
})

const readers = (overrides: Partial<PortalReaders> = {}): PortalReaders => ({
  review: () => Promise.reject(new Error('sem review')),
  flow: () => Promise.reject(new Error('sem fluxo')),
  dora: () => Promise.reject(new Error('sem dora')),
  task: () => Promise.resolve(null),
  ...overrides,
})

describe('ferramentas dos rascunhos', () => {
  const signal = new AbortController().signal

  it('resume o review do time sem carga nem pares por pessoa', async () => {
    const tools = createPortalTools(
      readers({
        review: async () => ({
          title: 'Demo',
          generatedAt: '2026-11-21T12:00:00.000Z',
          metrics: {
            windowDays: 30,
            merged: 4,
            medianHoursToFirstReview: 3,
            medianBusinessDaysToMerge: 1,
            medianSize: 120,
            mergedWithFailingChecks: 0,
            signals: { pronto: 3, gate: 0, ajustes: 1, sem_comentario: 0 },
            reviewers: [{ reviewer: 'pessoa-a', reviews: 9, pullRequests: 4, comments: 2 }],
            pairs: [{ author: 'pessoa-b', reviewer: 'pessoa-a', count: 3 }],
          },
          trend: [],
          alerts: [
            { kind: 'fila', severity: 'alta', subject: 'PR #1', message: 'parado', url: null },
          ],
        }),
      }),
    )
    const output = await tools.metricas_review.call({ conjunto: 'demo' }, signal)
    const summary = JSON.parse(output.text)
    expect(summary).toMatchObject({ conjunto: 'demo', metricas: { merged: 4 }, totalDeAlertas: 1 })
    expect(output.text).not.toContain('pessoa-a')
    expect(summary.alertas).toEqual([{ kind: 'fila', severity: 'alta', message: 'parado' }])
  })

  it('recusa argumento inválido e time junto com repositório no DORA', async () => {
    const tools = createPortalTools(readers())
    expect((await tools.metricas_review.call({ conjunto: 'prod' }, signal)).text).toContain(
      'Argumentos inválidos para metricas_review',
    )
    expect(
      (await tools.metricas_dora.call({ time: 'Plataforma', repositorio: 'a/b' }, signal)).text,
    ).toBe('Use time ou repositório, não os dois.')
    expect((await tools.tarefa.call({ chave: '../segredo' }, signal)).text).toContain(
      'Argumentos inválidos',
    )
    expect((await tools.tarefa.call({ chave: 'LAB-999' }, signal)).text).toContain(
      'Task LAB-999 não encontrada',
    )
  })

  it('passa a janela padrão de 4 semanas para fluxo e DORA', async () => {
    const queries: unknown[] = []
    const tools = createPortalTools(
      readers({
        flow: (query) => {
          queries.push(query)
          return Promise.reject(new Error('sem dados'))
        },
        dora: (query) => {
          queries.push(query)
          return Promise.reject(new Error('sem dados'))
        },
      }),
    )
    await tools.metricas_fluxo.call({ componente: 'portal' }, signal)
    await tools.metricas_dora.call({ repositorio: 'lab-demo/campanhas-api' }, signal)
    expect(queries).toEqual([
      { weeks: 4, component: 'portal' },
      { weeks: 4, repo: 'lab-demo/campanhas-api' },
    ])
  })

  it('lê as tasks de exemplo só pela chave', async () => {
    const tasks = new TaskFixtures(TASKS)
    expect(await tasks.find('LAB-53')).toMatchObject({ key: 'LAB-53', labels: ['plataforma'] })
    expect(await tasks.find('LAB-999')).toBeNull()
    expect(await tasks.find('../../package')).toBeNull()
    await expect(new TaskFixtures('/dev/null').find('LAB-1')).rejects.toThrow()
  })
})

describe('skill de referência de cada modo', () => {
  it('marca a skill que falta no plugin ou no catálogo', () => {
    const lookup = skillLookup((plugin) =>
      plugin === 'lab-grill' ? [{ name: 'grill', description: 'Entrevista' }] : null,
    )
    expect(lookup({ plugin: 'lab-grill', skill: 'grill' })).toEqual({
      plugin: 'lab-grill',
      skill: 'grill',
      description: 'Entrevista',
      found: true,
    })
    expect(lookup({ plugin: 'lab-grill', skill: 'outra' }).found).toBe(false)
    expect(lookup({ plugin: 'sumiu', skill: 'grill' })).toMatchObject({
      description: null,
      found: false,
    })
  })

  it('não quebra o modo quando o catálogo de IA está fora', async () => {
    const fake = new FakeProvider()
    fake.play({ text: ['Rascunho.'] })
    const app = await start({ ...LLM_ENV, PORTAL_MARKETPLACE_DIR: '/nope/marketplace' }, fake)
    const res = await request(app.getHttpServer()).get('/api/ask/modes').expect(200)
    expect(res.body.modes[1].skill).toMatchObject({ plugin: 'lab-grill', found: false })
    await streamIn(app, { mode: 'refine-task', question: 'Refine a task LAB-53' })
    expect(systemPrompt(fake)).not.toContain('Skill de referência')
    await app.close()
  })
})
