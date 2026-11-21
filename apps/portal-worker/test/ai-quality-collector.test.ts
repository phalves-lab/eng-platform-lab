import { deflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { AiUsageRepository, EvalRunRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import {
  type Pricing,
  evalRunArtifact,
  loadPricing,
  parseArtifact,
  usageArtifact,
} from '@lab/llm-usage'
import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAiQualityCollector } from '../src/collectors/ai-quality/collector.js'
import { createFixtureArtifactSource } from '../src/collectors/ai-quality/fixture-source.js'
import {
  AI_ARTIFACT_NAME,
  createGitHubArtifactSource,
} from '../src/collectors/ai-quality/github-source.js'
import { buildAiQualityCollector } from '../src/collectors/ai-quality/index.js'
import type { AiArtifactSource } from '../src/collectors/ai-quality/source.js'
import { ZipReadError, readZip } from '../src/collectors/ai-quality/zip.js'
import { loadAiCommandConfig, loadAiQualityConfig, loadConfig } from '../src/config.js'
import { createLogger } from '../src/logger.js'

const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const FIXTURES = repoPath('fixtures/ai-evals')
const NOW = new Date('2026-11-21T12:00:00.000Z')
const databaseUrl = process.env.DATABASE_URL

const run: EvalRun = {
  id: 'bot-20261120T100000Z-abc1234',
  suite: 'bot',
  runAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  model: 'gemini-2.5-pro',
  promptVersion: '1.1.0',
  offline: false,
  total: 2,
  passed: 2,
  inputTokens: 20,
  outputTokens: 2,
  latencyMs: { p50: 100, max: 200 },
  cases: [],
}

const record: AiUsageRecord = {
  id: '0b6f1f9e-9d3c-4a1b-8f00-000000000001',
  occurredAt: '2026-11-20T10:00:00.000Z',
  origin: 'bot',
  model: 'gemini-2.5-pro',
  inputTokens: 1_000_000,
  outputTokens: 0,
  costUsd: null,
  pricingVersion: null,
  team: '@phalves-lab/campanhas',
  skill: null,
  repository: 'lab-demo/campanhas-api',
  pullRequest: 12,
  runId: null,
}

/** Minimal zip writer for the tests: one local header and one directory entry per file. */
const zipOf = (files: Record<string, string>, method: 0 | 8 = 8) => {
  const locals: Buffer[] = []
  const entries: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text)
    const data = method === 8 ? deflateRawSync(raw) : raw
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(method, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    entries.push(entry, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(entries)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const json = (value: unknown) => JSON.stringify(value)

const logs = () => {
  const lines: string[] = []
  return {
    logger: createLogger((line) => lines.push(line)),
    events: () => lines.map((line) => JSON.parse(line) as { msg: string }),
  }
}

describe('leitor de zip dos artefatos', () => {
  it('lê entradas comprimidas e guardadas e ignora pastas', () => {
    const files = readZip(zipOf({ 'a.json': '{"a":1}', 'pasta/': '' }))
    expect(files.map((file) => [file.name, file.content.toString()])).toEqual([
      ['a.json', '{"a":1}'],
    ])
    expect(readZip(zipOf({ 'b.txt': 'texto' }, 0))[0]?.content.toString()).toBe('texto')
  })

  it('recusa arquivo que não é zip ou entrada maior que o limite', () => {
    expect(() => readZip(Buffer.alloc(10))).toThrow(ZipReadError)
    expect(() => readZip(Buffer.alloc(40))).toThrow('diretório central')
    expect(() => readZip(zipOf({ 'grande.json': 'x'.repeat(100) }), 10)).toThrow('limite')
    const unsupported = zipOf({ 'c.json': '{}' }, 0)
    unsupported.writeUInt16LE(12, unsupported.length - 22 - 46 - 6 + 10)
    expect(() => readZip(unsupported)).toThrow('não suportada')
  })
})

describe('adaptador GitHub dos artefatos de IA', () => {
  const listing = {
    artifacts: [
      { id: 2, name: AI_ARTIFACT_NAME, expired: false, created_at: '2026-11-20T10:00:00Z' },
      { id: 3, name: AI_ARTIFACT_NAME, expired: true, created_at: '2026-11-21T10:00:00Z' },
      { id: 4, name: 'outro', expired: false, created_at: '2026-11-21T10:00:00Z' },
      { id: 5, name: AI_ARTIFACT_NAME, expired: false, created_at: '2026-11-19T10:00:00Z' },
      { id: 6, name: AI_ARTIFACT_NAME, expired: false, created_at: '2026-11-18T10:00:00Z' },
    ],
  }

  const fakeGitHub = () => {
    const calls: { url: string; method: string | undefined; auth: string | null }[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({
        url,
        method: init?.method,
        auth: new Headers(init?.headers).get('authorization'),
      })
      if (url.includes('/actions/artifacts?')) return Response.json(listing)
      if (url.endsWith('/artifacts/2/zip')) {
        return new Response(
          zipOf({
            'bot-eval.json': json(evalRunArtifact(run)),
            'bot-usage.json': json(usageArtifact([record])),
            'leia-me.txt': 'ignorado',
          }),
        )
      }
      if (url.endsWith('/artifacts/5/zip')) return new Response('expirado', { status: 410 })
      return new Response('', { status: 404 })
    })
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
  }

  it('só faz GET, baixa os artefatos válidos mais novos e registra as falhas', async () => {
    const github = fakeGitHub()
    const source = createGitHubArtifactSource({
      token: 'token-de-teste',
      repository: 'phalves-lab/eng-platform-lab',
      apiUrl: 'https://api.github.example/',
      fetchImpl: github.fetchImpl,
      maxArtifacts: 2,
    })
    const collected = await source.collect()
    expect(github.calls.every((call) => call.method === 'GET')).toBe(true)
    expect(github.calls.every((call) => call.auth === 'Bearer token-de-teste')).toBe(true)
    expect(github.calls.map((call) => call.url)).toEqual([
      'https://api.github.example/repos/phalves-lab/eng-platform-lab/actions/artifacts?name=ai-quality&per_page=100',
      'https://api.github.example/repos/phalves-lab/eng-platform-lab/actions/artifacts/2/zip',
      'https://api.github.example/repos/phalves-lab/eng-platform-lab/actions/artifacts/5/zip',
    ])
    expect(collected.source).toBe('github')
    expect(collected.parsed.map((item) => item.name)).toEqual([
      '2/bot-eval.json',
      '2/bot-usage.json',
    ])
    expect(collected.failures).toEqual([
      '5: GitHub respondeu 410 em /repos/phalves-lab/eng-platform-lab/actions/artifacts/5/zip',
    ])
  })

  it('falha a coleta quando a listagem é recusada', async () => {
    const fetchImpl = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    const source = createGitHubArtifactSource({ token: 't', repository: 'o/r', fetchImpl })
    await expect(source.collect()).rejects.toMatchObject({ status: 401 })
  })
})

describe('coletor ai-quality', () => {
  let pricing: Pricing

  beforeAll(async () => {
    pricing = await loadPricing(repoPath('catalog/ai/pricing.yaml'))
  })

  const stores = () => ({
    runs: { save: vi.fn((items: EvalRun[]) => Promise.resolve(items.length)) },
    usage: { record: vi.fn((items: AiUsageRecord[]) => Promise.resolve(items.length)) },
  })

  it('grava runs e uso com custo estimado e avisa artefato quebrado sem parar', async () => {
    const repositories = stores()
    const source: AiArtifactSource = {
      collect: async () => ({
        source: 'github',
        parsed: [
          parseArtifact('run.json', json(evalRunArtifact(run))),
          parseArtifact('uso.json', json(usageArtifact([record]))),
          parseArtifact('quebrado.json', '{'),
        ],
        failures: [],
      }),
    }
    const output = logs()
    await createAiQualityCollector({ source, pricing, intervalMs: 1, ...repositories }).run({
      now: NOW,
      logger: output.logger,
    })
    expect(repositories.runs.save).toHaveBeenCalledWith([run], 'github')
    expect(repositories.usage.record).toHaveBeenCalledWith([
      { ...record, costUsd: 1.25, pricingVersion: pricing.version },
    ])
    expect(output.events().map((event) => event.msg)).toEqual([
      'ai-quality.artifact.invalid',
      'ai-quality.saved',
    ])
  })

  it('falha no fim quando algum download não veio', async () => {
    const repositories = stores()
    const source: AiArtifactSource = {
      collect: async () => ({ source: 'github', parsed: [], failures: ['7: 500'] }),
    }
    const output = logs()
    await expect(
      createAiQualityCollector({ source, pricing, intervalMs: 1, ...repositories }).run({
        now: NOW,
        logger: output.logger,
      }),
    ).rejects.toThrow('1 artefato')
    expect(repositories.runs.save).toHaveBeenCalledWith([], 'github')
  })

  it('lê as fixtures sintéticas sem erro', async () => {
    const collected = await createFixtureArtifactSource(FIXTURES).collect()
    expect(collected.source).toBe('fixture')
    expect(collected.parsed.every((item) => item.ok)).toBe(true)
    expect(collected.parsed.length).toBeGreaterThan(10)
  })
})

describe('configuração do coletor ai-quality', () => {
  it('fica desligado no worker por padrão e usa as fixtures no comando', () => {
    expect(loadAiQualityConfig({})).toBeNull()
    expect(loadConfig({ DATABASE_URL: 'postgres://x', WORKER_DATASETS: 'demo' }).ai).toBeNull()
    expect(loadAiQualityConfig({}, 'fixture')?.source).toEqual({ kind: 'fixture', dir: FIXTURES })
    expect(loadAiCommandConfig({ DATABASE_URL: 'postgres://x' }).ai.source.kind).toBe('fixture')
    expect(() => loadAiCommandConfig({})).toThrow('Invalid worker configuration')
    expect(() =>
      loadAiCommandConfig({ DATABASE_URL: 'postgres://x', WORKER_AI_EVALS_SOURCE: 'off' }),
    ).toThrow('nothing to collect')
  })

  it('exige token e repositório para ler o GitHub', () => {
    expect(() => loadAiQualityConfig({ WORKER_AI_EVALS_SOURCE: 'github' })).toThrow('GITHUB_TOKEN')
    expect(
      loadAiQualityConfig({
        WORKER_AI_EVALS_SOURCE: 'github',
        GITHUB_TOKEN: 't',
        GITHUB_REPOSITORY: 'phalves-lab/eng-platform-lab',
        GITHUB_API_URL: 'https://api.github.example/',
      })?.source,
    ).toEqual({
      kind: 'github',
      token: 't',
      repository: 'phalves-lab/eng-platform-lab',
      apiUrl: 'https://api.github.example',
      maxArtifacts: 30,
    })
  })
})

describe.skipIf(!databaseUrl)('coletor ai-quality no Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })
  afterAll(async () => {
    await db.drop()
  })

  it('grava as fixtures uma vez só, mesmo rodando duas vezes', async () => {
    const config = loadAiQualityConfig({}, 'fixture')
    if (!config) throw new Error('config esperada')
    const collector = await buildAiQualityCollector(config, db.pool, 1)
    const output = logs()
    await collector.run({ now: NOW, logger: output.logger })
    await collector.run({ now: NOW, logger: output.logger })
    const runs = await new EvalRunRepository(db.pool).list('2000-01-01T00:00:00.000Z')
    const usage = await new AiUsageRepository(db.pool).list('2000-01-01T00:00:00.000Z')
    expect(runs).toHaveLength(17)
    expect(usage.some((item) => item.costUsd !== null && item.pricingVersion !== null)).toBe(true)
    expect(usage.some((item) => item.costUsd === null)).toBe(true)
    const saved = output.events().filter((event) => event.msg === 'ai-quality.saved')
    expect(saved.at(-1)).toMatchObject({ runsWritten: 0, usageWritten: 0 })
  }, 20_000)
})
