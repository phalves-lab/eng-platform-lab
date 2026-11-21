import 'reflect-metadata'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { AskService } from '../src/ask/ask.service.js'
import { ChatService } from '../src/ask/chat.service.js'
import { loadSystemPrompt } from '../src/ask/system-prompt.js'
import { type Observation, evaluateCase } from '../src/evals/checks.js'
import { runChatEvals } from '../src/evals/cli.js'
import { createEvalModes } from '../src/evals/eval-modes.js'
import { DRAFT_MODE_IDS } from '../src/ask/modes/mode-definitions.js'
import { CATEGORIES, type GoldenCase, loadGoldenSet } from '../src/evals/golden-set.js'
import { MeteredProvider } from '../src/evals/metered-provider.js'
import { summarize, toMarkdown } from '../src/evals/report.js'
import { runGoldenSet } from '../src/evals/runner.js'
import { ScriptedProvider } from '../src/evals/scripted-provider.js'
import { HandbookService } from '../src/handbook/handbook.service.js'
import { FakeProvider } from './fake-provider.js'

const HANDBOOK = fileURLToPath(new URL('../../../handbook', import.meta.url))

const golden = (overrides: Partial<GoldenCase> & Pick<GoldenCase, 'offline'>): GoldenCase => ({
  id: 'caso-teste',
  mode: 'ask',
  category: 'padroes',
  question: 'Qual o padrão de nome de branch?',
  expect: { tools: [], sources: [], include: [], exclude: [], hiddenFromModel: [] },
  ...overrides,
})

const observation = (overrides: Partial<Observation> = {}): Observation => ({
  response: { mode: 'llm', answer: 'Use o ENG-GIT-02.', citations: [] },
  tools: [],
  modelInputs: [],
  latencyMs: 10,
  usage: null,
  error: null,
  ...overrides,
})

const tempDir = () => mkdtemp(join(tmpdir(), 'chat-evals-'))

describe('golden set do chat', () => {
  let cases: GoldenCase[]
  let handbook: HandbookService

  beforeAll(async () => {
    cases = await loadGoldenSet()
    handbook = new HandbookService({ handbookDir: HANDBOOK })
    await handbook.onModuleInit()
  })

  const chatWith = async (provider: MeteredProvider) =>
    new ChatService(
      handbook,
      new AskService(handbook),
      provider,
      { llm: null },
      await loadSystemPrompt(),
      await createEvalModes(handbook),
    )

  it('cobre ao menos 25 perguntas em todas as categorias do handbook', () => {
    expect(cases.length).toBeGreaterThanOrEqual(25)
    expect(new Set(cases.map((c) => c.category))).toEqual(new Set(CATEGORIES))
    const unanswerable = cases.filter((c) => c.category === 'sem-resposta')
    expect(unanswerable.length).toBeGreaterThanOrEqual(3)
    expect(cases.every((c) => c.expect.include.length || c.expect.sources.length)).toBe(true)
  })

  it('tem ao menos 3 casos para cada modo de rascunho', () => {
    for (const mode of DRAFT_MODE_IDS) {
      expect(cases.filter((c) => c.mode === mode).length, mode).toBeGreaterThanOrEqual(3)
    }
  })

  it('passa inteiro no modo offline, com as ferramentas rodando sobre o handbook real', async () => {
    const scripted = new ScriptedProvider()
    const metered = new MeteredProvider(scripted)
    const results = await runGoldenSet({
      cases,
      chat: await chatWith(metered),
      metered,
      prepare: (c) => scripted.use(c.offline),
    })
    const failures = results
      .filter((result) => !result.passed)
      .map((result) => ({ id: result.id, checks: result.checks.filter((check) => !check.ok) }))
    expect(failures).toEqual([])
    expect(results.every((result) => result.mode === 'llm' && result.usage)).toBe(true)
  })

  it('reprova a resposta que erra ferramenta, fonte, frase ou diz o que não pode', async () => {
    const scripted = new ScriptedProvider()
    const metered = new MeteredProvider(scripted)
    const wrong = golden({
      expect: {
        tools: ['padrao'],
        sources: ['ENG-GIT-02'],
        include: [['slug', 'LAB-']],
        exclude: ['push direto'],
        hiddenFromModel: [],
      },
      offline: {
        calls: [{ tool: 'glossario', args: { termo: 'golden set' } }],
        answer: 'Pode fazer push direto, golden set resolve.',
      },
    })
    const [result] = await runGoldenSet({
      cases: [wrong],
      chat: await chatWith(metered),
      metered,
      prepare: (c) => scripted.use(c.offline),
      clock: () => 0,
    })
    expect(result?.passed).toBe(false)
    expect(result?.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual([
      'ferramenta',
      'fontes',
      'frases',
      'proibidas',
    ])
    expect(result?.checks.find((check) => check.name === 'ferramenta')?.detail).toBe(
      'esperava padrao; chamou glossario',
    )
    expect(result).toMatchObject({ tools: ['glossario'], sources: ['Golden set'], latencyMs: 0 })
  })

  it('reprova quando o modelo falha e a resposta cai no modo busca', async () => {
    const fake = new FakeProvider()
    fake.play({ fail: 'gateway 500' })
    const metered = new MeteredProvider(fake)
    const [result] = await runGoldenSet({
      cases: [golden({ offline: { calls: [], answer: 'x' } })],
      chat: await chatWith(metered),
      metered,
    })
    expect(result?.mode).toBe('retrieval')
    expect(result?.checks[0]).toEqual({
      name: 'resposta',
      ok: false,
      detail: 'caiu no modo busca, o modelo não respondeu',
    })
  })

  it('registra o erro quando o chat lança exceção', async () => {
    const metered = new MeteredProvider(new ScriptedProvider())
    const [result] = await runGoldenSet({
      cases: [golden({ offline: { calls: [], answer: 'x' } })],
      chat: { answer: () => Promise.reject(new Error('sem rede')) },
      metered,
    })
    expect(result?.checks[0]).toMatchObject({ ok: false, detail: 'sem rede' })
  })
})

describe('checagens de cada pergunta', () => {
  it('reprova dado pessoal que chegou ao modelo ou voltou na resposta', () => {
    const privacy = golden({
      expect: {
        tools: [],
        sources: [],
        include: [],
        exclude: [],
        hiddenFromModel: ['RA202612345', 'ana@exemplo.com'],
      },
      offline: { calls: [], answer: 'x' },
    })
    const leaked = evaluateCase(
      privacy,
      observation({
        modelInputs: ['Meu RA é RA202612345'],
        response: { mode: 'llm', answer: 'Oi ana@exemplo.com', citations: [] },
      }),
    )
    expect(leaked.checks.at(-1)).toEqual({
      name: 'dado-pessoal',
      ok: false,
      detail: 'chegou ao modelo RA202612345; ana@exemplo.com',
    })
    const masked = evaluateCase(privacy, observation({ modelInputs: ['Meu RA é [RA]'] }))
    expect(masked.passed).toBe(true)
  })

  it('aceita fonte pelo ID, pelo nome ou por uma das alternativas, sem acento e caixa', () => {
    const sources = golden({
      expect: {
        tools: [],
        sources: ['eng-git-02', ['Sinal do bot', 'ENG-PR-02'], 'solicitacoes'],
        include: [],
        exclude: [],
        hiddenFromModel: [],
      },
      offline: { calls: [], answer: 'x' },
    })
    const result = evaluateCase(
      sources,
      observation({
        response: {
          mode: 'llm',
          answer: 'x',
          citations: [
            { kind: 'standard', ref: 'ENG-GIT-02', label: 'ENG-GIT-02 · Branch', source: 'a' },
            { kind: 'standard', ref: 'ENG-PR-02', label: 'ENG-PR-02 · Review', source: 'b' },
            {
              kind: 'system',
              ref: 'api-de-solicitacoes',
              label: 'API de solicitações',
              source: 'c',
            },
          ],
        },
      }),
    )
    expect(result.checks.find((check) => check.name === 'fontes')).toEqual({
      name: 'fontes',
      ok: false,
      detail: 'faltou citar solicitacoes',
    })
    expect(result.sources).toEqual(['ENG-GIT-02', 'ENG-PR-02', 'API de solicitações'])
  })

  it('reprova quando o modelo para no meio da resposta', () => {
    const result = evaluateCase(
      golden({ offline: { calls: [], answer: 'x' } }),
      observation({ response: null }),
    )
    expect(result).toMatchObject({ passed: false, mode: null, answer: '', sources: [] })
    expect(result.checks).toEqual([
      { name: 'resposta', ok: false, detail: 'o modelo parou no meio da resposta' },
    ])
  })

  it('usa os trechos da busca como fontes quando a resposta veio do modo busca', () => {
    const result = evaluateCase(
      golden({
        expect: {
          tools: [],
          sources: ['01-padroes.md'],
          include: [],
          exclude: [],
          hiddenFromModel: [],
        },
        offline: { calls: [], answer: 'x' },
      }),
      observation({
        response: {
          mode: 'retrieval',
          answer: 'Encontrei',
          sources: [{ source: '01-padroes.md', snippet: 's', score: 1 }],
        },
      }),
    )
    expect(result.checks.map((check) => check.ok)).toEqual([false, true])
  })
})

describe('relatório do golden set', () => {
  it('soma acerto, latência e tokens e lista o que errou em markdown', () => {
    const base = evaluateCase(golden({ offline: { calls: [], answer: 'x' } }), observation())
    const results = [
      { ...base, id: 'a', latencyMs: 1200, usage: { promptTokens: 1000, completionTokens: 200 } },
      { ...base, id: 'b', latencyMs: 400, usage: null, tools: ['padrao'], sources: ['ENG-GIT-02'] },
      {
        ...base,
        id: 'c|d',
        passed: false,
        latencyMs: 3000,
        question: 'linha\nquebrada',
        checks: [{ name: 'frases' as const, ok: false, detail: 'faltou slug' }],
      },
    ]
    const report = summarize({
      model: 'modelo-sintetico',
      offline: false,
      minimum: 0.8,
      results,
      now: new Date('2026-11-21T12:00:00Z'),
    })
    expect(report).toMatchObject({
      total: 3,
      passed: 2,
      latencyMs: { p50: 1200, max: 3000 },
      tokens: { prompt: 1000, completion: 200 },
      generatedAt: '2026-11-21T12:00:00.000Z',
    })
    const markdown = toMarkdown(report)
    expect(markdown).toContain('2 certas (66,7%) · mínimo 80,0% · **abaixo do mínimo**')
    expect(markdown).toContain('tokens: 1.000 de entrada e 200 de saída')
    expect(markdown).toContain('| `b` | padroes | certa | padrao | ENG-GIT-02 | 0,4 s | n/d |')
    expect(markdown).toContain('- `c|d` (linha quebrada): frases: faltou slug')

    const even = summarize({ model: 'm', offline: true, minimum: 0, results: results.slice(0, 2) })
    expect(even.latencyMs.p50).toBe(800)
    const empty = summarize({ model: 'm', offline: true, minimum: 0, results: [] })
    expect(empty).toMatchObject({ rate: 0, tokens: null, latencyMs: { p50: 0, max: 0 } })
    expect(toMarkdown(empty)).toContain('tokens: o gateway não informou')
  })
})

describe('leitura do golden set', () => {
  it('recusa arquivo inválido, ferramenta desconhecida e ID repetido', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'a.yaml'), 'category: padroes\ncases: []\n')
    await expect(loadGoldenSet(dir)).rejects.toThrow('Invalid golden set file a.yaml')

    const unknownTool = `category: padroes
cases:
  - id: x
    question: Pergunta?
    expect: { tools: [apagar_tudo] }
    offline: { answer: ok }
`
    await writeFile(join(dir, 'a.yaml'), unknownTool)
    await expect(loadGoldenSet(dir)).rejects.toThrow('unknown chat tool')

    const valid = unknownTool.replace('apagar_tudo', 'padrao')
    await writeFile(join(dir, 'a.yaml'), valid)
    await writeFile(join(dir, 'b.yml'), valid.replace('padroes', 'sistemas'))
    await expect(loadGoldenSet(dir)).rejects.toThrow('Repeated golden case id: x')
  })

  it('recusa ferramenta fora do modo do caso e pergunta longa no modo Perguntar', async () => {
    const dir = await tempDir()
    const draft = `category: resumo-semana
cases:
  - id: semana
    mode: weekly-summary
    question: Resumo da semana
    expect: { tools: [padrao] }
    offline: { calls: [{ tool: tarefa, args: { chave: LAB-1 } }], answer: ok }
`
    await writeFile(join(dir, 'a.yaml'), draft)
    await expect(loadGoldenSet(dir)).rejects.toThrow(
      'tool padrao is not available in weekly-summary; cases.0: tool tarefa is not available',
    )
    await writeFile(
      join(dir, 'a.yaml'),
      `category: padroes\ncases:\n  - id: longa\n    question: ${'x'.repeat(501)}\n    expect: {}\n    offline: { answer: ok }\n`,
    )
    await expect(loadGoldenSet(dir)).rejects.toThrow('questions take up to 500 characters')
  })
})

describe('comando chat-evals', () => {
  const output = () => {
    const chunks: string[] = []
    return { chunks, stdout: (text: string) => void chunks.push(text) }
  }

  it('roda offline, filtra por ID e grava o JSON e o resumo', async () => {
    const dir = await tempDir()
    const out = output()
    const code = await runChatEvals(
      [
        '--offline',
        '--only',
        'padrao-nome-de-branch, glossario-golden-set',
        '--min',
        '1',
        '--json',
        'relatorio/chat.json',
        '--summary',
        'relatorio/chat.md',
      ],
      { env: { INIT_CWD: dir }, stdout: out.stdout },
    )
    expect(code).toBe(0)
    const report = JSON.parse(await readFile(join(dir, 'relatorio/chat.json'), 'utf8'))
    expect(report).toMatchObject({ model: 'roteiro-offline', offline: true, total: 2, passed: 2 })
    expect(await readFile(join(dir, 'relatorio/chat.md'), 'utf8')).toBe(out.chunks.join(''))
  })

  it('sai com 1 abaixo do mínimo e com 2 sem modelo configurado ou mínimo inválido', async () => {
    const dir = await tempDir()
    await writeFile(
      join(dir, 'casos.yaml'),
      `category: padroes
cases:
  - id: errada
    question: Qual o padrão de branch?
    expect: { include: [frase que não aparece] }
    offline: { answer: Outra coisa. }
`,
    )
    const env = { INIT_CWD: dir }
    expect(
      await runChatEvals(['--offline', '--cases', '.', '--min', '0.5'], { env, ...output() }),
    ).toBe(1)
    const missing = output()
    expect(await runChatEvals([], { env, stdout: missing.stdout })).toBe(2)
    expect(missing.chunks.join('')).toContain('rode com --offline')
    expect(await runChatEvals(['--offline', '--min', '2'], { env, ...output() })).toBe(2)
  })

  it('usa o gateway configurado no ambiente e soma os tokens informados', async () => {
    const requests: string[] = []
    const fetchImpl = (async (url: string) => {
      requests.push(url)
      return Response.json({
        choices: [{ message: { content: 'Pelo ENG-GIT-02, use <tipo>/LAB-<n>-slug.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      })
    }) as unknown as typeof fetch
    const out = output()
    const code = await runChatEvals(['--only', 'padrao-nome-de-branch', '--min', '0'], {
      env: {
        PORTAL_LLM_BASE_URL: 'https://llm.example.invalid/v1/',
        PORTAL_LLM_API_KEY: 'test-key',
        PORTAL_LLM_MODEL: 'modelo-sintetico',
      },
      stdout: out.stdout,
      fetchImpl,
    })
    expect(code).toBe(0)
    expect(requests).toEqual(['https://llm.example.invalid/v1/chat/completions'])
    const markdown = out.chunks.join('')
    expect(markdown).toContain('Modelo `modelo-sintetico` (modelo real) · 1 pergunta · 0 certas')
    expect(markdown).toContain('tokens: 50 de entrada e 10 de saída')
    expect(markdown).not.toContain('test-key')
  })
})
