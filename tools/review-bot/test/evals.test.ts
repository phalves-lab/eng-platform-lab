import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  filesFromPatch,
  loadEvalCases,
  renderResults,
  scoreCase,
  summarize,
  type EvalCase,
} from '../src/evals.js'
import type { Review } from '../src/review.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))

const baseCase: EvalCase = {
  id: 'x',
  description: 'd',
  confidential: false,
  task: null,
  patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n',
  fileContents: {},
  checks: [],
  expect: {
    findings: [{ files: ['src/a.ts'], minSeverity: 'alta', layer: 'correcao' }],
    acceptance: [{ criterion: 'Não aprova a própria', status: ['nao_encontrado', 'parcial'] }],
    signal: ['ajustes'],
    noSevereFindings: false,
  },
}

const review: Review = {
  businessSummary: 's',
  acceptance: [
    { criterion: 'Nao aprova a propria campanha', status: 'nao_encontrado', evidence: '' },
  ],
  outOfScope: [],
  findings: [
    {
      layer: 'correcao',
      severity: 'critica',
      file: 'apps/x/src/a.ts',
      line: 3,
      title: 'Bug',
      detail: 'd',
    },
  ],
  missingTests: [],
  suggestedRiskLabels: [],
  docsNeedUpdate: false,
}

describe('golden set do repositório', () => {
  it('todos os casos públicos são válidos e não confidenciais', async () => {
    const cases = await loadEvalCases(`${root}review/evals/cases`)
    expect(cases.length).toBeGreaterThanOrEqual(6)
    expect(cases.every((c) => !c.confidential)).toBe(true)
    expect(cases.every((c) => filesFromPatch(c.patch).length > 0)).toBe(true)
  })

  it('recusa caso inválido com o nome do arquivo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'evals-'))
    await writeFile(join(dir, 'ruim.json'), JSON.stringify({ id: 'r' }))
    await expect(loadEvalCases(dir)).rejects.toThrow('ruim.json')
  })
})

describe('scoreCase', () => {
  it('passa quando achado, critério e sinal batem (ignorando acento e caminho relativo)', () => {
    const result = scoreCase(baseCase, review, 'ajustes')
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(3)
  })

  it('falha com severidade abaixo, camada errada, critério ausente e sinal errado', () => {
    const weak: Review = {
      ...review,
      acceptance: [],
      findings: [{ ...review.findings[0]!, severity: 'media' }],
    }
    const result = scoreCase(baseCase, weak, 'pronto')
    expect(result.passed).toBe(false)
    expect(result.checks.map((c) => c.ok)).toEqual([false, false, false])
    expect(result.checks[1]?.detail).toBe('critério ausente no review')

    const wrongLayer: Review = {
      ...review,
      findings: [{ ...review.findings[0]!, layer: 'padrao' }],
    }
    expect(scoreCase(baseCase, wrongLayer, 'ajustes').checks[0]?.ok).toBe(false)
  })

  it('mede falso positivo em caso limpo', () => {
    const clean: EvalCase = {
      ...baseCase,
      expect: { findings: [], acceptance: [], noSevereFindings: true },
    }
    expect(scoreCase(clean, review, 'pronto').passed).toBe(false)
    expect(scoreCase(clean, { ...review, findings: [] }, 'pronto').passed).toBe(true)
  })
})

describe('relatório', () => {
  it('resume e lista pulados', () => {
    const passed = scoreCase(baseCase, review, 'ajustes')
    const failed = scoreCase(baseCase, { ...review, findings: [] }, 'ajustes')
    expect(summarize([passed, failed])).toEqual({ total: 2, passed: 1, rate: 0.5 })
    expect(summarize([])).toEqual({ total: 0, passed: 0, rate: 0 })
    const text = renderResults([passed, failed], ['privado-1'])
    expect(text).toContain('PASSOU  x')
    expect(text).toContain('FALHOU  x')
    expect(text).toContain('PULADO  privado-1')
    expect(text).toContain('1/2 casos (50%)')
  })

  it('extrai arquivos do patch sem repetir', () => {
    expect(filesFromPatch('+++ b/a.ts\n+++ b/a.ts\n--- /dev/null\n+++ b/b.sql\n')).toEqual([
      'a.ts',
      'b.sql',
    ])
  })
})

describe('achados incertos no placar', () => {
  it('conta achado incerto como encontrado e não como falso positivo', () => {
    const uncertain = [{ ...review.findings[0]!, severity: 'media' as const }]
    const found: EvalCase = {
      ...baseCase,
      expect: {
        findings: [{ files: ['src/a.ts'], minSeverity: 'media' }],
        acceptance: [],
        noSevereFindings: true,
      },
    }
    const result = scoreCase(found, { ...review, findings: [] }, 'pronto', uncertain)
    expect(result.passed).toBe(true)
  })
})
