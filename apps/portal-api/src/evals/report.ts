import type { CaseResult } from './checks.js'

export interface GoldenSetReport {
  model: string
  offline: boolean
  generatedAt: string
  total: number
  passed: number
  rate: number
  minimum: number
  latencyMs: { p50: number; max: number }
  tokens: { prompt: number; completion: number } | null
  results: CaseResult[]
}

export interface ReportInput {
  model: string
  offline: boolean
  minimum: number
  results: CaseResult[]
  now?: Date
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (!sorted.length) return 0
  if (sorted.length % 2) return sorted[middle] ?? 0
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

/** Adds up the run: pass rate, latency and the tokens reported by the model. */
export const summarize = ({ model, offline, minimum, results, now }: ReportInput) => {
  const passed = results.filter((result) => result.passed).length
  const latencies = results.map((result) => result.latencyMs)
  const usages = results.flatMap((result) => (result.usage ? [result.usage] : []))
  const report: GoldenSetReport = {
    model,
    offline,
    generatedAt: (now ?? new Date()).toISOString(),
    total: results.length,
    passed,
    rate: results.length ? passed / results.length : 0,
    minimum,
    latencyMs: { p50: median(latencies), max: Math.max(0, ...latencies) },
    tokens: usages.length
      ? {
          prompt: usages.reduce((total, usage) => total + usage.promptTokens, 0),
          completion: usages.reduce((total, usage) => total + usage.completionTokens, 0),
        }
      : null,
    results,
  }
  return report
}

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')}%`

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

const count = (value: number) => value.toLocaleString('pt-BR')

const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ')

const tokensOf = (result: CaseResult) =>
  result.usage ? count(result.usage.promptTokens + result.usage.completionTokens) : 'n/d'

/** Markdown for the terminal and the CI job summary. */
export const toMarkdown = (report: GoldenSetReport) => {
  const verdict = report.rate >= report.minimum ? 'passou' : 'abaixo do mínimo'
  const source = report.offline ? 'roteiro offline' : 'modelo real'
  const tokens = report.tokens
    ? `tokens: ${count(report.tokens.prompt)} de entrada e ${count(report.tokens.completion)} de saída`
    : 'tokens: o gateway não informou'
  const lines = [
    '## Golden set do chat',
    '',
    `Modelo \`${report.model}\` (${source}) · ${plural(report.total, 'pergunta', 'perguntas')} · ${plural(report.passed, 'certa', 'certas')} (${percent(report.rate)}) · mínimo ${percent(report.minimum)} · **${verdict}**`,
    '',
    `Latência p50 ${seconds(report.latencyMs.p50)}, máxima ${seconds(report.latencyMs.max)} · ${tokens}`,
    '',
    '| Pergunta | Categoria | Resultado | Ferramentas | Fontes citadas | Latência | Tokens |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.results.map((result) =>
      [
        '',
        `\`${result.id}\``,
        result.category,
        result.passed ? 'certa' : 'errada',
        cell(result.tools.join(', ') || 'nenhuma'),
        cell(result.sources.join(', ') || 'nenhuma'),
        seconds(result.latencyMs),
        tokensOf(result),
        '',
      ]
        .join(' | ')
        .trim(),
    ),
  ]
  const failures = report.results.filter((result) => !result.passed)
  if (failures.length) {
    lines.push('', '### O que errou', '')
    for (const result of failures) {
      const failed = result.checks
        .filter((check) => !check.ok)
        .map((check) => [check.name, check.detail].join(': '))
      lines.push(`- \`${result.id}\` (${cell(result.question)}): ${failed.join('; ')}`)
    }
  }
  return `${lines.join('\n')}\n`
}
