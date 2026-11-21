import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ScorecardReportSchema } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import { loadRepoCatalog, loadScorecardPolicy } from '../src/collectors/scorecard/catalog.js'
import { createScorecardCollector } from '../src/collectors/scorecard/collector.js'
import { createFixtureRepoSource } from '../src/collectors/scorecard/fixture-source.js'
import {
  buildScorecardCollector,
  DEFAULT_SCORECARD_OUT,
  loadScorecardConfig,
} from '../src/collectors/scorecard/index.js'
import { createFileScorecardStore } from '../src/collectors/scorecard/store.js'
import { createLogger } from '../src/logger.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const NOW = new Date('2026-11-21T12:00:00.000Z')

const run = async (collector: Awaited<ReturnType<typeof buildScorecardCollector>>) => {
  const lines: string[] = []
  await collector.run({ now: NOW, logger: createLogger((line) => lines.push(line)) })
  return lines.map((line) => JSON.parse(line) as { msg: string })
}

const readReport = async (path: string) =>
  ScorecardReportSchema.parse(JSON.parse(await readFile(path, 'utf8')))

describe('configuração do scorecard', () => {
  it('usa fixtures e as pastas versionadas por padrão e exige token no modo github', () => {
    const config = loadScorecardConfig({})
    expect(config).toMatchObject({
      source: 'fixture',
      out: null,
      reposDir: join(ROOT, 'catalog/repos'),
      policyFile: join(ROOT, 'catalog/scorecard/policy.yaml'),
      fixturesDir: join(ROOT, 'fixtures/scorecard'),
      github: null,
    })
    expect(DEFAULT_SCORECARD_OUT).toBe(join(ROOT, '.portal-data/scorecard.json'))
    expect(() => loadScorecardConfig({ WORKER_SCORECARD_SOURCE: 'github' })).toThrow(
      'requires GITHUB_TOKEN',
    )
    expect(
      loadScorecardConfig({
        WORKER_SCORECARD_SOURCE: 'github',
        GITHUB_TOKEN: 'tok',
        WORKER_SCORECARD_OUT: join(tmpdir(), 's.json'),
      }),
    ).toMatchObject({
      out: join(tmpdir(), 's.json'),
      github: { token: 'tok', apiUrl: 'https://api.github.com' },
    })
    expect(loadScorecardConfig({ WORKER_SCORECARD_OUT: ' ', GITHUB_TOKEN: 'tok' })).toMatchObject({
      out: null,
      github: null,
    })
  })
})

describe('catálogo e política do scorecard', () => {
  it('lê o catálogo do laboratório com o repositório real e os fictícios', async () => {
    const catalog = await loadRepoCatalog(join(ROOT, 'catalog/repos'))
    expect(catalog.map((entry) => [entry.id, entry.source])).toEqual([
      ['eng-platform-lab', 'github'],
      ['pedidos-api', 'fixture'],
      ['relatorios-batch', 'fixture'],
      ['vitrine-web', 'fixture'],
    ])
    expect(catalog.every((entry) => entry.integrationBranch === 'develop')).toBe(true)
  })

  it('recusa arquivo inválido, repositório repetido e política sem peso', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repos-'))
    await writeFile(join(dir, 'a.yaml'), 'id: a\nrepo: o/a\nname: A\nteam: T\n')
    await writeFile(join(dir, 'b.yml'), 'id: b\nrepo: o/a\nname: B\nteam: T\n')
    await writeFile(join(dir, 'notas.txt'), 'ignorado')
    await expect(loadRepoCatalog(dir)).rejects.toThrow('repete b (o/a) em b.yml')
    await writeFile(join(dir, 'b.yml'), 'id: B\nrepo: invalido\nname: B\nteam: T\n')
    await expect(loadRepoCatalog(dir)).rejects.toThrow(/Repositório em b.yml inválido: id/)

    const policy = join(dir, 'policy.yaml')
    await writeFile(policy, 'checks: {}\n')
    await expect(loadScorecardPolicy(policy)).rejects.toThrow('Política do scorecard')
  })
})

describe('coletor do scorecard', () => {
  it('gera o relatório do laboratório só com fixtures e grava de forma atômica', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'scorecard-')), 'nested', 'scorecard.json')
    const collector = await buildScorecardCollector(loadScorecardConfig({}), out, 60_000)
    const logs = await run(collector)
    const report = await readReport(out)

    expect(collector).toMatchObject({ name: 'scorecard', schedule: { intervalMs: 60_000 } })
    expect(report.generatedAt).toBe(NOW.toISOString())
    expect(report.repos.map((repo) => [repo.id, repo.score, repo.level])).toEqual([
      ['eng-platform-lab', 93, 'good'],
      ['pedidos-api', 89, 'good'],
      ['relatorios-batch', 10, 'critical'],
      ['vitrine-web', 54, 'attention'],
    ])
    expect(logs.map((log) => log.msg)).toContain('scorecard.saved')
  })

  it('no modo github consulta só os repositórios reais e mantém os fictícios nas fixtures', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'scorecard-')), 'scorecard.json')
    const urls: string[] = []
    const fetchImpl = ((input: string | URL | Request) => {
      urls.push(String(input))
      return Promise.resolve(new Response('{}', { status: 500 }))
    }) as typeof fetch
    const config = loadScorecardConfig({ WORKER_SCORECARD_SOURCE: 'github', GITHUB_TOKEN: 'tok' })
    const logs = await run(await buildScorecardCollector(config, out, 1000, fetchImpl))
    const report = await readReport(out)

    expect(urls).toEqual(['https://api.github.com/repos/phalves-lab/eng-platform-lab'])
    expect(report.repos[0]).toMatchObject({
      id: 'eng-platform-lab',
      score: null,
      level: 'unknown',
      checks: [],
      error: 'GitHub respondeu 500 em /repos/phalves-lab/eng-platform-lab',
    })
    expect(report.repos.slice(1).every((repo) => repo.error === null)).toBe(true)
    expect(logs.map((log) => log.msg)).toContain('scorecard.repo_failed')
  })

  it('registra fixture ausente ou inválida como erro do repositório', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fixtures-'))
    await writeFile(join(dir, 'quebrado.json'), JSON.stringify({ defaultBranch: '' }))
    const saved: unknown[] = []
    const policy = await loadScorecardPolicy(join(ROOT, 'catalog/scorecard/policy.yaml'))
    const base = { repo: 'o/x', name: 'X', team: 'T', source: 'fixture' as const }
    const collector = createScorecardCollector({
      catalog: [
        { ...base, id: 'ausente', integrationBranch: 'develop' },
        { ...base, id: 'quebrado', repo: 'o/y', integrationBranch: 'develop' },
      ],
      policy,
      sourceFor: () => createFixtureRepoSource(dir),
      store: { save: (report) => Promise.resolve(void saved.push(report)) },
      intervalMs: 1,
    })
    await collector.run({ now: NOW, logger: createLogger(() => undefined) })
    const [report] = saved as { repos: { error: string }[] }[]
    expect(report?.repos.map((repo) => repo.error)).toEqual([
      'Sem fixture de scorecard para ausente',
      expect.stringContaining('Fixture de scorecard inválida para quebrado'),
    ])
  })

  it('não grava relatório fora do contrato', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'scorecard-')), 'scorecard.json')
    const store = createFileScorecardStore(out)
    await expect(
      store.save({ schemaVersion: 1, generatedAt: 'ontem', repos: [] }),
    ).rejects.toThrow()
    await expect(readFile(out, 'utf8')).rejects.toThrow()
  })
})
