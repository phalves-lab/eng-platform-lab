import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  filesOutsideCatalog,
  loadCatalog,
  loadRiskRules,
  matchesPath,
  modulesForFiles,
  riskLabelsForFiles,
} from '../src/catalog.js'
import { listCheckRuns, listPullFiles, upsertStickyComment } from '../src/github.js'
import { GeminiProvider } from '../src/llm/gemini.js'
import {
  checkHygiene,
  sectionContent,
  withoutBodyRules,
  type PullRequestFacts,
} from '../src/pr-hygiene.js'
import {
  COMMENT_MARKER,
  applyVerification,
  buildPrompt,
  buildVerificationPrompt,
  computeSignal,
  renderComment,
  type Review,
  type ReviewContext,
} from '../src/review.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))

const review: Review = {
  businessSummary: 'Permite aprovar campanhas de alto orçamento com dois aprovadores.',
  acceptance: [
    { criterion: 'Dois aprovadores acima de R$ 50 mil', status: 'atendido', evidence: 'teste' },
    { criterion: 'Bloquear autoaprovação', status: 'parcial', evidence: 'sem teste' },
  ],
  outOfScope: ['Renomeou variáveis no módulo de relatórios'],
  findings: [
    {
      layer: 'padrao',
      severity: 'baixa',
      file: 'a.ts',
      line: null,
      title: 'Nome',
      detail: 'Pouco claro',
    },
    {
      layer: 'correcao',
      severity: 'critica',
      file: 'b.ts',
      line: 10,
      title: 'Bug',
      detail: 'Ignora status',
    },
    {
      layer: 'correcao',
      severity: 'media',
      file: 'c.ts',
      line: 3,
      title: 'Borda',
      detail: 'Data vazia',
    },
  ],
  missingTests: ['Autoaprovação'],
  suggestedRiskLabels: ['risk:db-migration', 'risk:billing'],
  docsNeedUpdate: true,
}

const clean: Review = {
  ...review,
  acceptance: [{ criterion: 'x', status: 'atendido', evidence: 'y' }],
  findings: [],
  outOfScope: [],
  missingTests: [],
  suggestedRiskLabels: [],
  docsNeedUpdate: false,
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
  taskOrigin: 'base',
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
  uncataloged: [],
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
    expect(filesOutsideCatalog(catalog, [...files, 'apps/web/page.tsx', 'README.md'])).toEqual([
      'apps/web/page.tsx',
    ])
  })
})

describe('prompts', () => {
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

  it('monta o prompt de verificação com o achado isolado', () => {
    const finding = review.findings[1]
    if (!finding) throw new Error('setup')
    const prompt = buildVerificationPrompt('{{FINDING}}|{{TASK}}|{{DIFF}}', finding, context())
    expect(prompt).toContain('<untrusted_data>\n[critica] Bug\nArquivo: b.ts:10')
    expect(prompt).toContain('Chave: LAB-1')
  })
})

describe('verificação adversarial e sinal', () => {
  it('verifica só achados graves e descarta os refutados', async () => {
    const verify = vi.fn(async () => ({ verdict: 'refutado' as const, reason: 'já tratado' }))
    const result = await applyVerification(review, verify)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(result.refuted.map((f) => f.title)).toEqual(['Bug'])
    expect(result.review.findings.map((f) => f.title)).toEqual(['Nome', 'Borda'])
  })

  it('mantém achado grave que se sustenta', async () => {
    const result = await applyVerification(review, async () => ({
      verdict: 'confirmado' as const,
      reason: 'ok',
    }))
    expect(result.refuted).toEqual([])
    expect(result.uncertain).toEqual([])
    expect(result.review.findings).toHaveLength(3)
  })

  it('rebaixa achado incerto e tira do sinal', async () => {
    const result = await applyVerification(review, async () => ({
      verdict: 'incerto' as const,
      reason: 'sem evidência',
    }))
    expect(result.uncertain).toEqual([expect.objectContaining({ title: 'Bug', severity: 'alta' })])
    expect(result.review.findings.map((f) => f.title)).toEqual(['Nome', 'Borda'])
    expect(computeSignal(result.review, context())).not.toBe('ajustes')
  })

  it('calcula o sinal pela ordem ajustes, gate, pronto', () => {
    expect(computeSignal(review, context())).toBe('ajustes')
    expect(
      computeSignal(
        { ...clean, acceptance: [{ criterion: 'x', status: 'nao_encontrado', evidence: '' }] },
        context(),
      ),
    ).toBe('ajustes')
    expect(computeSignal({ ...clean, docsNeedUpdate: true }, context())).toBe('gate')
    expect(computeSignal(clean, context({ uncataloged: ['apps/web/x.ts'] }))).toBe('gate')
    expect(computeSignal(clean, context())).toBe('pronto')
    expect(
      computeSignal(
        { ...clean, acceptance: [{ criterion: 'x', status: 'parcial', evidence: '' }] },
        context(),
      ),
    ).toBe('gate')
  })
})

describe('renderComment', () => {
  it('separa camadas, ordena por severidade e separa rótulos sugeridos', () => {
    const comment = renderComment(review, context(), {
      model: 'gemini-x',
      promptVersion: '1.1.0',
      refuted: 2,
      uncertain: [],
    })
    expect(comment.startsWith(COMMENT_MARKER)).toBe(true)
    expect(comment).toContain('**Sinal:** Ajustes recomendados')
    const layer1 = comment.slice(comment.indexOf('Camada 1'), comment.indexOf('Camada 2'))
    expect(layer1.indexOf('critica')).toBeLessThan(layer1.indexOf('media'))
    expect(layer1).not.toContain('Nome')
    expect(comment.slice(comment.indexOf('Camada 2'))).toContain('Nome')
    expect(comment).toContain('`b.ts:10`')
    expect(comment).toContain('Parcial')
    expect(comment).toContain('`risk:billing`')
    expect(comment).not.toMatch(/sugeridos.*risk:db-migration/)
    expect(comment).toContain('2 achado(s) grave(s) descartado(s)')
    expect(comment).toContain('não aprova nem bloqueia')
  })

  it('cobre task ausente, catálogo pendente e listas vazias', () => {
    const comment = renderComment(
      { ...clean, acceptance: [] },
      context({
        task: null,
        taskKey: null,
        modules: [],
        riskRules: [],
        uncataloged: ['apps/web/x.ts'],
      }),
      { model: 'm', promptVersion: 'v', refuted: 0, uncertain: [] },
    )
    expect(comment).toContain('não identificada')
    expect(comment).toContain('RN-05')
    expect(comment).toContain('Nenhum achado.')
    expect(comment).toContain('`apps/web/x.ts`')
    expect(comment).toContain('Pendências antes do merge')
  })
})

describe('checkHygiene', () => {
  const body = [
    '**Task:** [LAB-1](https://exemplo/browse/LAB-1)',
    '## Contexto de negócio',
    'Permite aprovar campanhas grandes.',
    '## O que mudou',
    'Regra de dois aprovadores.',
    '## Como testar',
    'npm test no pacote da API.',
    '## SQL (se aplicável)',
    '```sql',
    '-- migrations ou alterações de banco desta entrega',
    '```',
    '## ENV (se aplicável)',
    '<!-- variáveis -->',
  ].join('\n')

  const pr = (overrides: Partial<PullRequestFacts> = {}): PullRequestFacts => ({
    title: 'feat(api): aprovação dupla',
    body,
    headRef: 'feat/LAB-1-aprovacao',
    baseRef: 'develop',
    files: ['apps/api/src/domain/campaign-request.ts'],
    ...overrides,
  })

  it('aceita PR no padrão', () => {
    expect(checkHygiene(pr())).toEqual([])
  })

  it('aponta título, branch, task e seções', () => {
    const issues = checkHygiene(
      pr({
        title: 'Ajustes',
        body: '## Contexto de negócio\n<!-- preencher -->',
        headRef: 'minha-branch',
      }),
    )
    expect(issues.map((i) => i.rule)).toEqual([
      'RN-08',
      'RN-06',
      'RN-11',
      'RN-11',
      'RN-11',
      'RN-11',
    ])
  })

  it('recusa placeholder e task diferente da branch', () => {
    expect(checkHygiene(pr({ body: body.replace(/LAB-1/g, 'CHAVE-123') }))[0]?.message).toContain(
      'sem a chave',
    )
    expect(checkHygiene(pr({ headRef: 'feat/LAB-2-outra' }))[0]?.message).toContain('diferente')
  })

  it('exige SQL quando há migração e ENV quando há variável nova', () => {
    const issues = checkHygiene(pr({ files: ['apps/api/migrations/002_x.sql', '.env.example'] }))
    expect(issues.map((i) => i.rule)).toEqual(['RN-27', 'RN-11'])
    const filled = body
      .replace(
        '-- migrations ou alterações de banco desta entrega',
        'ALTER TABLE x ADD COLUMN y INT;',
      )
      .replace('<!-- variáveis -->', 'NOVA_VAR em todos os ambientes')
    expect(
      checkHygiene(pr({ body: filled, files: ['apps/api/migrations/002_x.sql', '.env.example'] })),
    ).toEqual([])
  })

  it('só aceita PR para main vindo de develop ou hotfix', () => {
    expect(checkHygiene(pr({ baseRef: 'main' })).map((i) => i.rule)).toContain('RN-22')
    expect(
      checkHygiene(pr({ baseRef: 'main', headRef: 'develop', title: 'chore: release' })),
    ).toEqual([])
    expect(checkHygiene(pr({ baseRef: 'main', headRef: 'hotfix/LAB-1-corrige' }))).toEqual([])
  })

  it('libera branch do dependabot de task e template', () => {
    expect(
      checkHygiene(
        pr({ title: 'build(deps): bump zod', body: '', headRef: 'dependabot/npm_and_yarn/zod-4' }),
      ),
    ).toEqual([])
  })

  it('limpa comentários, cercas e linhas SQL de exemplo das seções', () => {
    expect(sectionContent(body, 'SQL')).toBe('')
    expect(sectionContent(body, 'Inexistente')).toBeNull()
  })
})

describe('integrações externas', () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

  it('Gemini devolve review e verificação validados', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({ candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }] }),
      )
      .mockResolvedValueOnce(
        json({
          candidates: [{ content: { parts: [{ text: '{"verdict":"confirmado","reason":"r"}' }] } }],
        }),
      )
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-x', fetchImpl })
    expect(await provider.review('p')).toEqual(review)
    expect(await provider.verify('p')).toEqual({ verdict: 'confirmado', reason: 'r' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/models/gemini-x:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
  })

  it('Gemini falha com erro HTTP ou JSON fora do schema', async () => {
    const http = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: vi.fn(async () => new Response('requisição inválida', { status: 400 })),
    })
    await expect(http.review('p')).rejects.toThrow('400')
    const bad = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      fetchImpl: vi.fn(async () =>
        json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
      ),
    })
    await expect(bad.review('p')).rejects.toThrow()
  })

  it('GitHub atualiza comentário existente e cria quando não há', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 5, body: `${COMMENT_MARKER} antigo` }]))
      .mockResolvedValueOnce(json({}))
    expect(
      await upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: update }, 3, 'novo'),
    ).toBe('updated')
    expect((update.mock.calls[1] as [string, RequestInit])[1].method).toBe('PATCH')

    const create = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({}, 201))
    expect(
      await upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: create }, 3, 'novo'),
    ).toBe('created')
    expect((create.mock.calls[1] as [string])[0]).toContain('/issues/3/comments')

    const failing = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(
      upsertStickyComment({ token: 't', repository: 'o/r', fetchImpl: failing }, 3, 'x'),
    ).rejects.toThrow('403')
  })

  it('GitHub lista arquivos do PR com paginação', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.ts` }))
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(page1))
      .mockResolvedValueOnce(json([{ filename: 'last.ts' }]))
    const files = await listPullFiles({ token: 't', repository: 'o/r', fetchImpl }, 7)
    expect(files).toHaveLength(101)
    expect((fetchImpl.mock.calls[1] as [string])[0]).toContain('page=2')

    const failing = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(
      listPullFiles({ token: 't', repository: 'o/r', fetchImpl: failing }, 7),
    ).rejects.toThrow('404')
  })
})

describe('origem da task', () => {
  it('avisa no prompt e no comentário quando a task veio do próprio PR', () => {
    const fromPr = context({ taskOrigin: 'pr' })
    expect(buildPrompt('{{TASK}}', fromPr)).toContain('arquivo do próprio PR')
    expect(buildPrompt('{{TASK}}', context())).not.toContain('arquivo do próprio PR')
    expect(
      renderComment(clean, fromPr, { model: 'm', promptVersion: 'v', refuted: 0, uncertain: [] }),
    ).toContain('(lida do próprio PR)')
  })
})

describe('higiene local sem corpo do PR', () => {
  it('descarta só regras do corpo e mantém título, branch e fluxo', () => {
    const issues = checkHygiene({
      title: 'Ajustes',
      body: '',
      headRef: 'minha-branch',
      baseRef: 'main',
      files: ['apps/api/migrations/003_x.sql'],
    })
    expect(issues.map((i) => i.rule)).toContain('RN-11')
    expect(issues.map((i) => i.rule)).toContain('RN-27')
    expect(withoutBodyRules(issues).map((i) => i.rule)).toEqual(['RN-08', 'RN-22', 'RN-06'])
  })
})

describe('evidências da verificação', () => {
  const finding = review.findings[1]!

  it('coloca o arquivo do achado primeiro, respeita o orçamento e lista os checks', () => {
    const prompt = buildVerificationPrompt('{{FILES}}|{{CHECKS}}', finding, context(), {
      files: { 'a.ts': 'conteudo a', 'b.ts': 'conteudo b', 'grande.ts': 'x'.repeat(50_000) },
      checks: [{ name: 'security / dependency-review', conclusion: 'success' }],
    })
    expect(prompt.indexOf('### b.ts')).toBeLessThan(prompt.indexOf('### a.ts'))
    expect(prompt).toContain('### grande.ts\n[omitido por tamanho]')
    expect(prompt).toContain('- security / dependency-review: success')
  })

  it('avisa quando não há arquivos nem checks', () => {
    const prompt = buildVerificationPrompt('{{FILES}}|{{CHECKS}}', finding, context())
    expect(prompt).toContain('Conteúdo dos arquivos indisponível.')
    expect(prompt).toContain('Resultado dos checks indisponível.')
  })

  it('mostra a seção a confirmar e a contagem no rodapé', () => {
    const comment = renderComment(clean, context(), {
      model: 'm',
      promptVersion: 'v',
      refuted: 1,
      uncertain: [{ ...finding, severity: 'alta' }],
    })
    expect(comment).toContain('### A confirmar pelo revisor')
    expect(comment).toContain('1 achado(s) grave(s) descartado(s) e 1 rebaixado(s)')
    expect(comment).toContain('**Sinal:** Pronto para revisão humana')
  })

  it('lista checks do commit pela API', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        check_runs: [
          { name: 'verify / gates', status: 'completed', conclusion: 'success' },
          { name: 'quality', status: 'in_progress', conclusion: null },
        ],
      }),
    )
    expect(await listCheckRuns({ token: 't', repository: 'o/r', fetchImpl }, 'abc1234')).toEqual([
      { name: 'verify / gates', conclusion: 'success' },
      { name: 'quality', conclusion: 'in_progress' },
    ])
    const failing = vi.fn(async () => new Response('', { status: 403 }))
    await expect(
      listCheckRuns({ token: 't', repository: 'o/r', fetchImpl: failing }, 'abc1234'),
    ).rejects.toThrow('403')
  })
})
