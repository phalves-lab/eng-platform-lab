import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  loadCatalog,
  loadRiskRules,
  matchesPath,
  modulesForFiles,
  riskLabelsForFiles,
} from '../src/catalog.js'
import { upsertStickyComment } from '../src/github.js'
import { GeminiProvider } from '../src/llm/gemini.js'
import { checkHygiene } from '../src/pr-hygiene.js'
import {
  COMMENT_MARKER,
  buildPrompt,
  renderComment,
  type Review,
  type ReviewContext,
} from '../src/review.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))

const review: Review = {
  businessSummary: 'Permite aprovar campanhas de alto orçamento com dois aprovadores.',
  acceptance: [
    {
      criterion: 'Dois aprovadores acima de R$ 50 mil',
      status: 'atendido',
      evidence: 'teste approve',
    },
    { criterion: 'Bloquear autoaprovação', status: 'nao_encontrado', evidence: 'sem teste' },
  ],
  outOfScope: ['Renomeou variáveis no módulo de relatórios'],
  findings: [
    { severity: 'baixa', file: 'a.ts', line: null, title: 'Nome', detail: 'Pouco claro' },
    { severity: 'critica', file: 'b.ts', line: 10, title: 'Bug', detail: 'Ignora status' },
  ],
  missingTests: ['Autoaprovação'],
  suggestedRiskLabels: ['risk:db-migration', 'risk:billing'],
  docsNeedUpdate: true,
}

const context = (overrides: Partial<ReviewContext> = {}): ReviewContext => ({
  task: {
    key: 'LAB-1',
    title: 'Aprovação dupla',
    description: 'desc',
    acceptanceCriteria: ['a', 'b'],
    status: 'Em andamento',
    labels: [],
    epic: null,
    url: 'https://x/browse/LAB-1',
  },
  taskKey: 'LAB-1',
  modules: [
    {
      name: 'campaign-requests',
      description: 'Solicitações',
      owner: '@dono',
      tier: 'tier-1',
      businessUnits: ['graduacao'],
      users: 'times de marketing',
      confluencePageId: 'p1',
      paths: ['apps/api/'],
    },
  ],
  docs: [{ id: 'p1', title: 'Doc', text: 'texto', updatedAt: null, url: null }],
  riskRules: [
    { label: 'risk:db-migration', description: 'migração', paths: ['apps/api/migrations/'] },
  ],
  files: ['apps/api/src/x.ts'],
  patch: 'diff --git a b',
  agentsGuide: 'guia',
  rubric: 'rubrica',
  ...overrides,
})

describe('catálogo e risco', () => {
  it('casa padrões de caminho', () => {
    expect(matchesPath('apps/api/migrations/001.sql', 'apps/api/migrations/')).toBe(true)
    expect(matchesPath('.github/workflows/ci.yml', '.github/workflows/**')).toBe(true)
    expect(matchesPath('apps/api/src/auth/token.ts', 'apps/*/src/auth/**')).toBe(true)
    expect(matchesPath('package.json', 'package.json')).toBe(true)
    expect(matchesPath('apps/api/src/x.ts', 'apps/web/')).toBe(false)
  })

  it('carrega catálogo e regras de risco reais do repositório', async () => {
    const catalog = await loadCatalog(`${root}catalog/modules`)
    const rules = await loadRiskRules(`${root}policy/risk-rules.yaml`)
    const files = ['apps/api/migrations/002_x.sql', 'apps/api/src/domain/campaign-request.ts']
    expect(modulesForFiles(catalog, files).map((m) => m.name)).toContain('campaign-requests')
    expect(riskLabelsForFiles(rules, files).map((r) => r.label)).toContain('risk:db-migration')
    expect(riskLabelsForFiles(rules, ['README.md'])).toEqual([])
  })
})

describe('buildPrompt', () => {
  it('preenche o template e isola dados não confiáveis', () => {
    const prompt = buildPrompt(
      '{{RUBRIC}}|{{TASK}}|{{DIFF}}|{{RISK_LABELS}}|{{UNKNOWN}}',
      context(),
    )
    expect(prompt).toContain('rubrica')
    expect(prompt).toContain('<untrusted_data>\nChave: LAB-1')
    expect(prompt).toContain('<untrusted_data>\ndiff --git a b')
    expect(prompt).toContain('risk:db-migration: migração')
    expect(prompt).toContain('{{UNKNOWN}}')
  })

  it('explica ausência de task, módulo e documentação', () => {
    const prompt = buildPrompt(
      '{{TASK}}{{MODULES}}{{DOCS}}{{RISK_LABELS}}',
      context({ task: null, taskKey: null, modules: [], docs: [], riskRules: [] }),
    )
    expect(prompt).toContain('Nenhuma chave de task')
    expect(prompt).toContain('Nenhum módulo do catálogo')
    expect(prompt).toContain('Nenhuma documentação vinculada')
    expect(buildPrompt('{{TASK}}', context({ task: null, taskKey: 'LAB-9' }))).toContain(
      'LAB-9 não encontrada',
    )
  })
})

describe('renderComment', () => {
  it('ordena achados por severidade e separa rótulos sugeridos', () => {
    const comment = renderComment(review, context(), { model: 'gemini-x', promptVersion: '1.0.0' })
    expect(comment.startsWith(COMMENT_MARKER)).toBe(true)
    expect(comment.indexOf('critica')).toBeLessThan(comment.indexOf('baixa'))
    expect(comment).toContain('`b.ts:10`')
    expect(comment).toContain('Não encontrado')
    expect(comment).toContain('`risk:billing`')
    expect(comment).not.toMatch(/sugeridos.*risk:db-migration/)
    expect(comment).toContain('não aprova nem bloqueia')
  })

  it('cobre task ausente e listas vazias', () => {
    const comment = renderComment(
      {
        ...review,
        acceptance: [],
        findings: [],
        outOfScope: [],
        missingTests: [],
        suggestedRiskLabels: [],
        docsNeedUpdate: false,
      },
      context({ task: null, taskKey: null, modules: [], riskRules: [] }),
      { model: 'm', promptVersion: 'v' },
    )
    expect(comment).toContain('não identificada')
    expect(comment).toContain('RN-05')
    expect(comment).toContain('Nenhum achado.')
  })
})

describe('checkHygiene', () => {
  const body =
    '## Contexto de negócio\nPermite aprovar campanhas grandes.\n## O que mudou\nRegra de dois aprovadores.\n## Como testar\nnpm test no pacote da API.'

  it('aceita PR no padrão', () => {
    expect(
      checkHygiene({ title: 'feat(api): aprovação dupla', body, headRef: 'feat/LAB-1-aprovacao' }),
    ).toEqual([])
  })

  it('aponta título, branch e seções', () => {
    const issues = checkHygiene({
      title: 'Ajustes',
      body: '## Contexto de negócio\n<!-- preencher -->',
      headRef: 'minha-branch',
    })
    expect(issues.map((i) => i.rule)).toEqual(['RN-08', 'RN-06', 'RN-11', 'RN-11', 'RN-11'])
  })

  it('libera branch do dependabot de task e template', () => {
    expect(
      checkHygiene({
        title: 'build(deps): bump zod',
        body: '',
        headRef: 'dependabot/npm_and_yarn/zod-4',
      }),
    ).toEqual([])
  })
})

describe('integrações externas', () => {
  it('Gemini devolve review validado', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }],
          }),
          {
            status: 200,
          },
        ),
    )
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-x', fetchImpl })
    expect(await provider.review('p')).toEqual(review)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-x:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
  })

  it('Gemini falha com erro HTTP ou JSON fora do schema', async () => {
    const http = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: vi.fn(async () => new Response('quota', { status: 429 })),
    })
    await expect(http.review('p')).rejects.toThrow('429')
    const bad = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })),
      ),
    })
    await expect(bad.review('p')).rejects.toThrow()
  })

  it('GitHub atualiza comentário existente e cria quando não há', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 5, body: `${COMMENT_MARKER} antigo` }])),
      )
      .mockResolvedValueOnce(new Response('{}'))
    expect(
      await upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: update }, 3, 'novo'),
    ).toBe('updated')
    expect((update.mock.calls[1] as [string, RequestInit])[1].method).toBe('PATCH')

    const create = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    expect(
      await upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: create }, 3, 'novo'),
    ).toBe('created')
    expect((create.mock.calls[1] as [string])[0]).toContain('/issues/3/comments')

    const failing = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(
      upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: failing }, 3, 'x'),
    ).rejects.toThrow('403')
  })
})
