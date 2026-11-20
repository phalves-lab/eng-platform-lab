import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Finding, Review, Signal } from './review.js'

const SEVERITIES = ['critica', 'alta', 'media', 'baixa'] as const
const SEVERITY_RANK: Record<(typeof SEVERITIES)[number], number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
}

const taskSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  status: z.string().default('Em andamento'),
  labels: z.array(z.string()).default([]),
  epic: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  area: z.string().nullable().default(null),
  demandType: z.string().nullable().default(null),
})

export const evalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  confidential: z.boolean().default(false),
  task: taskSchema.nullable(),
  patch: z.string().min(1),
  fileContents: z.record(z.string(), z.string()).default({}),
  checks: z.array(z.object({ name: z.string(), conclusion: z.string() })).default([]),
  expect: z.object({
    findings: z
      .array(
        z.object({
          files: z.array(z.string()).min(1),
          minSeverity: z.enum(SEVERITIES),
          layer: z.enum(['correcao', 'padrao']).optional(),
        }),
      )
      .default([]),
    acceptance: z
      .array(
        z.object({
          criterion: z.string(),
          status: z.array(z.enum(['atendido', 'parcial', 'nao_encontrado'])).min(1),
        }),
      )
      .default([]),
    signal: z.array(z.enum(['ajustes', 'gate', 'pronto'])).optional(),
    noSevereFindings: z.boolean().default(false),
  }),
})

export type EvalCase = z.infer<typeof evalCaseSchema>

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

export interface CaseResult {
  id: string
  passed: boolean
  checks: CheckResult[]
}

export const loadEvalCases = async (directory: string): Promise<EvalCase[]> => {
  const files = (await readdir(directory)).filter((f) => f.endsWith('.json')).sort()
  return Promise.all(
    files.map(async (file) => {
      const parsed = evalCaseSchema.safeParse(
        JSON.parse(await readFile(join(directory, file), 'utf8')),
      )
      if (!parsed.success) throw new Error(`Caso ${file} inválido: ${parsed.error.message}`)
      return parsed.data
    }),
  )
}

export const filesFromPatch = (patch: string): string[] => [
  ...new Set(
    patch
      .split('\n')
      .filter((line) => line.startsWith('+++ b/'))
      .map((line) => line.slice(6).trim()),
  ),
]

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

const samePath = (a: string, b: string) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)

/** Compara o review produzido com o que o caso espera encontrar. */
export const scoreCase = (
  evalCase: EvalCase,
  review: Review,
  signal: Signal,
  uncertain: Finding[] = [],
): CaseResult => {
  const allFindings = [...review.findings, ...uncertain]
  const checks: CheckResult[] = []

  for (const expected of evalCase.expect.findings) {
    const hit = allFindings.find(
      (f) =>
        expected.files.some((file) => samePath(f.file, file)) &&
        SEVERITY_RANK[f.severity] <= SEVERITY_RANK[expected.minSeverity] &&
        (!expected.layer || f.layer === expected.layer),
    )
    checks.push({
      name: `achado em ${expected.files.join(' ou ')} (>= ${expected.minSeverity})`,
      ok: Boolean(hit),
      detail: hit ? `${hit.severity}: ${hit.title}` : 'não encontrado',
    })
  }

  for (const expected of evalCase.expect.acceptance) {
    const target = normalize(expected.criterion)
    const item = review.acceptance.find((a) => {
      const criterion = normalize(a.criterion)
      return criterion.includes(target) || target.includes(criterion)
    })
    checks.push({
      name: `critério "${expected.criterion}" em ${expected.status.join('/')}`,
      ok: Boolean(item && expected.status.includes(item.status)),
      detail: item ? item.status : 'critério ausente no review',
    })
  }

  if (evalCase.expect.signal) {
    checks.push({
      name: `sinal em ${evalCase.expect.signal.join('/')}`,
      ok: evalCase.expect.signal.includes(signal),
      detail: signal,
    })
  }

  if (evalCase.expect.noSevereFindings) {
    const severe = review.findings.filter((f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK.alta)
    checks.push({
      name: 'sem achado crítico ou alto (falso positivo)',
      ok: severe.length === 0,
      detail: severe.length ? severe.map((f) => f.title).join('; ') : 'nenhum',
    })
  }

  return { id: evalCase.id, passed: checks.every((c) => c.ok), checks }
}

export const summarize = (results: CaseResult[]) => {
  const passed = results.filter((r) => r.passed).length
  return { total: results.length, passed, rate: results.length ? passed / results.length : 0 }
}

export const renderResults = (results: CaseResult[], skipped: string[]): string => {
  const lines: string[] = []
  for (const result of results) {
    lines.push(`${result.passed ? 'PASSOU' : 'FALHOU'}  ${result.id}`)
    for (const check of result.checks) {
      lines.push(`  ${check.ok ? 'ok ' : 'x  '} ${check.name}: ${check.detail}`)
    }
  }
  for (const id of skipped)
    lines.push(`PULADO  ${id} (dado confidencial: só dry-run no laboratório)`)
  const { total, passed, rate } = summarize(results)
  lines.push('', `Resultado: ${passed}/${total} casos (${(rate * 100).toFixed(0)}%).`)
  return lines.join('\n')
}
