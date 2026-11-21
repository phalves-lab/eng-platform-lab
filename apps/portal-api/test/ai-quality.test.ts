import 'reflect-metadata'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { INestApplication } from '@nestjs/common'
import { type AiUsageRecord, AiArtifactSchema, AiQualityResponseSchema } from '@lab/contracts'
import { AiUsageRepository, EvalRunRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { type Pricing, loadPricing, readArtifactDir } from '@lab/llm-usage'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module.js'
import {
  MemoryUsageSink,
  RecordingProvider,
  createModelProvider,
} from '../src/ask/model/recording-provider.js'
import { OpenAICompatibleProvider } from '../src/ask/model/openai-compatible.provider.js'
import { loadConfig } from '../src/config/config.js'
import { runChatEvals } from '../src/evals/cli.js'
import { chatRunId, commitOf, promptVersionOf } from '../src/evals/record.js'
import { DatabaseAiQualitySource } from '../src/quality/ai-quality-source.js'
import { CLOCK } from '../src/quality/clock.js'
import { FakeGatewaySpendSource, toGatewaySpend } from '../src/quality/gateway-spend.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const NOW = new Date('2026-11-21T18:00:00.000Z')
const databaseUrl = process.env.DATABASE_URL

const start = async (env: Record<string, string>, now = NOW) => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORTAL_HANDBOOK_DIR: join(ROOT, 'handbook'),
    PORTAL_PANEL_DATA: '/nope/data.json',
    ...env,
  })
  const module = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(CLOCK)
    .useValue(() => now)
    .compile()
  const app = module.createNestApplication({ logger: false })
  await app.init()
  return app
}

const turn = (usage?: { promptTokens: number; completionTokens: number }) => ({
  content: 'ok',
  toolCalls: [],
  ...(usage ? { usage } : {}),
})

const request0 = {
  messages: [],
  tools: [],
  signal: new AbortController().signal,
  onDelta: () => {},
}

describe('Qualidade > IA sem banco', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await start({ PORTAL_LITELLM_SPEND: 'fake' })
  })
  afterAll(() => app.close())

  it('mostra a precisão dos dois golden sets e avisa quando o último run do chat caiu', async () => {
    const response = await request(app.getHttpServer()).get('/api/quality/ai').expect(200)
    const body = AiQualityResponseSchema.parse(response.body)
    const [bot, chat] = body.precision
    expect(bot).toMatchObject({ suite: 'bot', threshold: 0.8 })
    expect(bot?.points).toHaveLength(8)
    expect(chat?.points.every((point) => point.model !== 'roteiro-offline')).toBe(true)
    expect(chat?.latest).toMatchObject({ rate: 0.7 })
    expect(body.alerts).toEqual([expect.objectContaining({ suite: 'chat', threshold: 0.8 })])
    expect(body.pricingVersion).toBe('2026-11-01')
  })

  it('estima o custo por origem, time e PR com a tabela de preço versionada', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/quality/ai').expect(200)
    const { cost } = AiQualityResponseSchema.parse(body)
    expect(cost.byOrigin.map((bucket) => bucket.key)).toEqual(['bot', 'chat', 'golden-set'])
    expect(cost.byOrigin.every((bucket) => bucket.costUsd > 0)).toBe(true)
    expect(cost.total.unpricedCalls).toBeGreaterThan(0)
    expect(cost.byTeam.map((bucket) => bucket.key)).toContain('@phalves-lab/campanhas')
    expect(cost.byPullRequest[0]?.repository).toMatch(/\//)
    expect(cost.byDay).toHaveLength(90)
  })

  it('lê o gasto da chave virtual pelo adaptador fake e recusa janela fora do limite', async () => {
    const server = app.getHttpServer()
    const { body } = await request(server).get('/api/quality/ai?days=30').expect(200)
    expect(body.days).toBe(30)
    expect(body.gateway).toMatchObject({
      source: 'fake',
      keyAlias: 'portal-lab',
      maxBudgetUsd: 50,
      readAt: NOW.toISOString(),
    })
    await request(server).get('/api/quality/ai?days=3').expect(400)
  })
})

describe('porta do LiteLLM', () => {
  it('converte o /key/info sem guardar a chave e esconde o cartão quando a leitura falha', async () => {
    expect(toGatewaySpend({ key: 'sk-segredo', info: { spend: 2 } }, 'litellm', NOW)).toEqual({
      source: 'litellm',
      keyAlias: 'sem apelido',
      spendUsd: 2,
      maxBudgetUsd: null,
      budgetResetAt: null,
      readAt: NOW.toISOString(),
    })
    expect(() => toGatewaySpend({ info: { spend: -1 } }, 'fake', NOW)).toThrow()
    const broken = new FakeGatewaySpendSource('/nope/key-info.json', () => NOW)
    await expect(broken.read()).rejects.toThrow()
    const app = await start({
      PORTAL_LITELLM_SPEND: 'fake',
      PORTAL_LITELLM_FAKE_FILE: '/nope/key-info.json',
    })
    const { body } = await request(app.getHttpServer()).get('/api/quality/ai').expect(200)
    expect(body.gateway).toBeNull()
    await app.close()
  })
})

describe('registro de uso do chat', () => {
  let pricing: Pricing

  beforeAll(async () => {
    pricing = await loadPricing(join(ROOT, 'catalog/ai/pricing.yaml'))
  })

  it('grava uma linha por chamada que informou tokens, com custo estimado', async () => {
    const inner = {
      model: 'gemini-2.5-flash',
      complete: vi
        .fn()
        .mockResolvedValueOnce(turn({ promptTokens: 1_000_000, completionTokens: 0 }))
        .mockResolvedValueOnce(turn()),
    }
    const sink = new MemoryUsageSink()
    const provider = new RecordingProvider(inner, sink, {
      origin: 'chat',
      pricing,
      now: () => NOW,
    })
    expect(provider.model).toBe('gemini-2.5-flash')
    await provider.complete(request0)
    await provider.complete(request0)
    expect(sink.records).toEqual([
      expect.objectContaining({
        origin: 'chat',
        occurredAt: NOW.toISOString(),
        inputTokens: 1_000_000,
        outputTokens: 0,
        costUsd: 0.3,
        pricingVersion: '2026-11-01',
        team: null,
        runId: null,
      }),
    ])
  })

  it('não derruba a resposta quando o banco recusa o registro', async () => {
    const sink = { record: vi.fn(() => Promise.reject(new Error('banco fora'))) }
    const provider = new RecordingProvider(
      { model: 'm', complete: async () => turn({ promptTokens: 1, completionTokens: 1 }) },
      sink,
      { origin: 'chat', pricing },
    )
    await expect(provider.complete(request0)).resolves.toMatchObject({ content: 'ok' })
    expect(sink.record).toHaveBeenCalledTimes(1)
  })

  it('só envolve o modelo quando há onde gravar', () => {
    const llm = {
      baseUrl: 'https://x.invalid',
      apiKey: 'k',
      model: 'm',
      timeoutMs: 1,
      maxToolRounds: 1,
    }
    expect(createModelProvider({ llm: null }, pricing, new MemoryUsageSink())).toBeNull()
    expect(createModelProvider({ llm }, pricing, null)).toBeInstanceOf(OpenAICompatibleProvider)
    expect(createModelProvider({ llm }, pricing, new MemoryUsageSink())).toBeInstanceOf(
      RecordingProvider,
    )
  })

  it('responde 503 enquanto as tabelas de IA não existem', async () => {
    const missing = Object.assign(new Error('relation does not exist'), { code: '42P01' })
    const pool = { query: () => Promise.reject(missing), end: () => Promise.resolve() }
    const source = new DatabaseAiQualitySource(pool as never)
    await expect(source.load('2026-11-01T00:00:00.000Z')).rejects.toMatchObject({ status: 503 })
    const other = new DatabaseAiQualitySource({
      query: () => Promise.reject(new Error('boom')),
      end: () => Promise.resolve(),
    } as never)
    await expect(other.load('2026-11-01T00:00:00.000Z')).rejects.toThrow('boom')
    await other.onModuleDestroy()
  })
})

describe('resultado do golden set do chat', () => {
  const fetchImpl = (async () =>
    Response.json({
      choices: [{ message: { content: 'Pelo ENG-GIT-02, use <tipo>/LAB-<n>-slug.' } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    })) as unknown as typeof fetch
  const modelEnv = {
    PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1',
    PORTAL_LLM_API_KEY: 'test-key',
    PORTAL_LLM_MODEL: 'gemini-2.5-flash',
    GITHUB_SHA: 'abc1234def',
  }

  it('grava o run e o uso no formato que o worker coleta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-artifacts-'))
    const code = await runChatEvals(
      [
        '--only',
        'padrao-nome-de-branch',
        '--artifact',
        'out/run.json',
        '--usage',
        'out/usage.json',
      ],
      { env: { ...modelEnv, INIT_CWD: dir }, stdout: () => undefined, fetchImpl },
    )
    expect(code).toBe(0)
    const run = AiArtifactSchema.parse(
      JSON.parse(await readFile(join(dir, 'out/run.json'), 'utf8')),
    )
    expect(run).toMatchObject({
      kind: 'eval-run',
      run: {
        suite: 'chat',
        commit: 'abc1234def',
        model: 'gemini-2.5-flash',
        offline: false,
        total: 1,
        inputTokens: 50,
        outputTokens: 10,
      },
    })
    const usage = AiArtifactSchema.parse(
      JSON.parse(await readFile(join(dir, 'out/usage.json'), 'utf8')),
    )
    if (usage.kind !== 'ai-usage' || run.kind !== 'eval-run') throw new Error('tipo inesperado')
    expect(usage.records).toEqual([
      expect.objectContaining({ origin: 'golden-set', runId: run.run.id, inputTokens: 50 }),
    ])
    expect((await readArtifactDir(join(dir, 'out'))).invalid).toEqual([])
  })

  it('identifica a versão do prompt e o commit', () => {
    expect(promptVersionOf('# Prompt de sistema do chat do portal (versão 2)')).toBe('2')
    expect(promptVersionOf('# Sem versão')).toBe('sem-versão')
    expect(commitOf({ GITHUB_SHA: 'abc1234' }, ROOT)).toBe('abc1234')
    expect(commitOf({}, ROOT)).toMatch(/^[0-9a-f]{40}$/)
    expect(commitOf({}, '/pasta/inexistente')).toBe('desconhecido')
    expect(chatRunId(NOW, 'abc1234def')).toBe('chat-20261121T180000Z-abc1234')
  })

  describe.skipIf(!databaseUrl)('com banco', () => {
    let db: IsolatedSchema

    beforeAll(async () => {
      db = await createIsolatedSchema(databaseUrl as string)
    })
    afterAll(async () => {
      await db.drop()
    })

    it('guarda o run e o uso na tabela e a tela lê do banco', async () => {
      const code = await runChatEvals(['--only', 'padrao-nome-de-branch'], {
        env: { ...modelEnv, DATABASE_URL: db.connectionString },
        stdout: () => undefined,
        fetchImpl,
      })
      expect(code).toBe(0)
      const runs = await new EvalRunRepository(db.pool).list('2000-01-01T00:00:00.000Z')
      expect(runs).toEqual([expect.objectContaining({ suite: 'chat', total: 1, passed: 0 })])
      const usage: AiUsageRecord[] = await new AiUsageRepository(db.pool).list(
        '2000-01-01T00:00:00.000Z',
      )
      expect(usage).toEqual([
        expect.objectContaining({ origin: 'golden-set', costUsd: 0.00004, runId: runs[0]?.id }),
      ])

      const app = await start({ DATABASE_URL: db.connectionString }, new Date())
      const { body } = await request(app.getHttpServer()).get('/api/quality/ai').expect(200)
      await app.close()
      const response = AiQualityResponseSchema.parse(body)
      expect(response.cost.byOrigin.find((bucket) => bucket.key === 'golden-set')?.calls).toBe(1)
    })
  })
})
