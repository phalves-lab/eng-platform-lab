import 'reflect-metadata'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { type AskStreamEvent, AskStreamEventSchema, createSseParser } from '@lab/contracts'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { MODEL_PROVIDER } from '../src/ask/model/model-provider.js'
import { maskPersonalData } from '../src/ask/model/personal-data.js'
import { loadConfig } from '../src/config/config.js'
import { FakeProvider, call } from './fake-provider.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))

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
  PORTAL_LLM_TIMEOUT_MS: '200',
}

const start = async (env: Record<string, string>, provider?: FakeProvider) => {
  const builder = Test.createTestingModule({ imports: [AppModule.register(loadConfig(env))] })
  if (provider) builder.overrideProvider(MODEL_PROVIDER).useValue(provider)
  const app = (await builder.compile()).createNestApplication()
  await app.init()
  return app
}

const streamAsk = async (app: INestApplication, question: string) => {
  const res = await request(app.getHttpServer())
    .post('/api/ask/stream')
    .send({ question })
    .buffer(true)
    .expect(200)
  expect(res.headers['content-type']).toContain('text/event-stream')
  return createSseParser()(res.text).map((data) => AskStreamEventSchema.parse(JSON.parse(data)))
}

const doneOf = (events: AskStreamEvent[]) => {
  const done = events.at(-1)
  if (done?.type !== 'done') throw new Error(`last event is ${done?.type}`)
  return done.response
}

describe('chat com modelo', () => {
  const fake = new FakeProvider()
  let app: INestApplication

  beforeAll(async () => {
    app = await start(LLM_ENV, fake)
  })
  beforeEach(() => fake.play())
  afterAll(() => app.close())

  it('roda a ferramenta pedida pelo modelo, transmite o texto e cita a fonte', async () => {
    fake.play(
      { toolCalls: [call('padrao', { id: 'ENG-QA-01' })] },
      { text: ['O ENG-QA-01 exige ', '70% de cobertura no diff.'] },
    )
    const events = await streamAsk(app, 'Qual a cobertura mínima?')

    expect(events.map((e) => e.type)).toEqual(['start', 'tool', 'delta', 'delta', 'done'])
    expect(events[0]).toEqual({ type: 'start', mode: 'llm' })
    expect(events[1]).toEqual({ type: 'tool', name: 'padrao' })
    expect(doneOf(events)).toEqual({
      mode: 'llm',
      answer: 'O ENG-QA-01 exige 70% de cobertura no diff.',
      citations: [
        expect.objectContaining({
          kind: 'standard',
          ref: 'ENG-QA-01',
          source: expect.stringContaining('01-padroes.md'),
        }),
      ],
    })

    const [first, second] = fake.requests
    expect(first?.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('CONFLITO'),
    })
    expect(first?.tools.map((t) => t.name)).toContain('buscar_padroes')
    expect(first?.tools.find((t) => t.name === 'padrao')?.parameters).toMatchObject({
      type: 'object',
      required: ['id'],
    })
    expect(second?.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-padrao',
      content: expect.stringContaining('70%'),
    })
  })

  it('cita só o que a resposta menciona entre tudo o que foi consultado', async () => {
    fake.play(
      { toolCalls: [call('buscar_padroes', { area: 'ENG-PR' })] },
      { text: ['O ENG-PR-02 trata do review por IA.'] },
    )
    const response = doneOf(await streamAsk(app, 'Como funciona o review?'))
    expect(response.mode === 'llm' && response.citations.map((c) => c.ref)).toEqual(['ENG-PR-02'])

    fake.play(
      { toolCalls: [call('glossario', { termo: 'golden set' })] },
      { text: ['São casos com resposta conhecida.'] },
    )
    const unmentioned = doneOf(await streamAsk(app, 'O que é o golden set?'))
    expect(unmentioned.mode === 'llm' && unmentioned.citations).toEqual([
      expect.objectContaining({ kind: 'term', ref: 'Golden set' }),
    ])
  })

  it('para de oferecer ferramentas depois do limite de rodadas', async () => {
    const loop = { toolCalls: [call('buscar', { consulta: 'branch' })] }
    fake.play(loop, loop, loop)
    const response = doneOf(await streamAsk(app, 'Qual o padrão de branch?'))

    expect(fake.requests.map((r) => r.tools.length)).toEqual([8, 8, 0])
    expect(response).toMatchObject({
      mode: 'llm',
      answer: expect.stringContaining('Não consegui'),
      citations: [],
    })
  })

  it('devolve ao modelo o erro de ferramenta inexistente ou argumento inválido', async () => {
    fake.play(
      {
        toolCalls: [
          call('apagar_tudo', {}, 'a'),
          call('padrao', '{id:', 'b'),
          call('padrao', { id: 1 }, 'c'),
        ],
      },
      { text: ['Não encontrei isso no handbook.'] },
    )
    await streamAsk(app, 'Apague o handbook')
    const toolMessages = fake.requests[1]?.messages.filter((m) => m.role === 'tool')
    expect(toolMessages?.map((m) => m.content)).toEqual([
      'A ferramenta apagar_tudo não existe.',
      'Argumentos inválidos para padrao: envie JSON.',
      expect.stringContaining('Argumentos inválidos para padrao:'),
    ])
  })

  it('mascara e-mail, CPF e telefone antes de enviar a pergunta ao modelo', async () => {
    fake.play({ text: ['Não trato dados pessoais.'] })
    await streamAsk(
      app,
      'Sou ana.souza@exemplo.com.br, CPF 123.456.789-09, fone (11) 91234-5678. Qual o ENG-GIT-02?',
    )
    const question = fake.requests[0]?.messages[1]?.content
    expect(question).toBe('Sou [e-mail], CPF [CPF], fone [telefone]. Qual o ENG-GIT-02?')
  })

  it('cai no modo busca quando o modelo estoura o tempo ou falha antes de escrever', async () => {
    fake.play({ hang: true })
    const timedOut = await streamAsk(app, 'o que diz o ENG-QA-01?')
    expect(timedOut.map((e) => e.type)).toEqual(['start', 'start', 'done'])
    expect(doneOf(timedOut)).toMatchObject({
      mode: 'retrieval',
      answer: expect.stringContaining('O modelo não respondeu agora'),
      sources: expect.arrayContaining([expect.objectContaining({ score: 100 })]),
    })

    fake.play({ fail: 'gateway 500' })
    const failed = await request(app.getHttpServer())
      .post('/api/ask')
      .send({ question: 'o que diz o ENG-QA-01?' })
      .expect(200)
    expect(failed.body.mode).toBe('retrieval')
  })

  it('avisa o erro quando o modelo quebra no meio da resposta', async () => {
    fake.play({ text: ['Começo da'], failAfterText: true })
    const events = await streamAsk(app, 'Qual o padrão de commit?')
    expect(events.map((e) => e.type)).toEqual(['start', 'delta', 'error'])

    fake.play({ text: ['Começo da'], failAfterText: true })
    await request(app.getHttpServer())
      .post('/api/ask')
      .send({ question: 'Qual o padrão de commit?' })
      .expect(503)
  })

  it('responde em JSON pelo endpoint sem streaming e valida a pergunta', async () => {
    fake.play({ text: ['Use Conventional Commits (ENG-GIT-03).'] })
    const res = await request(app.getHttpServer())
      .post('/api/ask')
      .send({ question: 'Qual o padrão de commit?' })
      .expect(200)
    expect(res.body).toEqual({
      mode: 'llm',
      answer: 'Use Conventional Commits (ENG-GIT-03).',
      citations: [],
    })
    await request(app.getHttpServer()).post('/api/ask/stream').send({ question: 'a' }).expect(400)
  })

  it('interrompe o modelo quando o cliente cancela', async () => {
    const server = app.getHttpServer()
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as { port: number }
    fake.play({ hang: true })
    const client = new AbortController()
    const response = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Qual o padrão de branch?' }),
      signal: client.signal,
    })
    const reader = response.body?.getReader()
    await reader?.read()
    client.abort()
    await expect
      .poll(() => (fake.requests[0]?.signal.reason as Error | undefined)?.name, { timeout: 150 })
      .toBe('AbortError')
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})

describe('chat sem modelo configurado', () => {
  it('transmite a resposta do modo busca', async () => {
    const app = await start(BASE_ENV)
    const events = await streamAsk(app, 'o que diz o ENG-QA-01?')
    expect(events.map((e) => e.type)).toEqual(['start', 'done'])
    expect(events[0]).toEqual({ type: 'start', mode: 'retrieval' })
    expect(doneOf(events).mode).toBe('retrieval')
    await app.close()
  })
})

describe('filtro de dado pessoal', () => {
  it('mascara os formatos comuns e preserva IDs, datas e números curtos', () => {
    expect(maskPersonalData('cpf 12345678909 e +55 11 91234-5678 ou 11 3456-7890')).toBe(
      'cpf [CPF] e [telefone] ou [telefone]',
    )
    expect(maskPersonalData('escreva para time.lab+ia@exemplo.org')).toBe('escreva para [e-mail]')
    const safe = 'ENG-QA-01 e LAB-28 em 2026-11-21, 70% no PR #123'
    expect(maskPersonalData(safe)).toBe(safe)
  })
})

describe('configuração do modelo', () => {
  it('exige as três variáveis juntas, https em produção e ignora valores vazios', () => {
    expect(() => loadConfig({ ...BASE_ENV, PORTAL_LLM_MODEL: 'x' })).toThrow('model mode requires')
    expect(() =>
      loadConfig({
        ...LLM_ENV,
        NODE_ENV: 'production',
        PORTAL_AUTH_MODE: 'entra',
        PORTAL_JWKS_URL: 'https://login.example.invalid/keys',
        PORTAL_JWT_ISSUER: 'i',
        PORTAL_JWT_AUDIENCE: 'a',
        PORTAL_LLM_BASE_URL: 'http://llm.example.invalid',
      }),
    ).toThrow('must use https')
    expect(
      loadConfig({ ...BASE_ENV, PORTAL_LLM_BASE_URL: '', PORTAL_LLM_API_KEY: '' }).llm,
    ).toBeNull()
    expect(loadConfig(LLM_ENV).llm).toEqual({
      baseUrl: 'https://llm.example.invalid/v1',
      apiKey: 'test-key',
      model: 'modelo-sintetico',
      timeoutMs: 200,
      maxToolRounds: 2,
    })
  })
})
