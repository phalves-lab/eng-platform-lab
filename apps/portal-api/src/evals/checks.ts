import type { AskResponse } from '@lab/contracts'
import { normalize } from '@lab/handbook'
import type { TokenUsage } from '../ask/model/model-provider.js'
import type { Alternatives, GoldenCase } from './golden-set.js'

export interface Observation {
  response: AskResponse | null
  tools: string[]
  /** Every user message the chat sent to the model while answering. */
  modelInputs: string[]
  latencyMs: number
  usage: TokenUsage | null
  error: string | null
}

type CheckName = 'resposta' | 'ferramenta' | 'fontes' | 'frases' | 'proibidas' | 'dado-pessoal'

interface CheckResult {
  name: CheckName
  ok: boolean
  detail: string
}

export interface CaseResult {
  id: string
  category: GoldenCase['category']
  question: string
  passed: boolean
  checks: CheckResult[]
  mode: AskResponse['mode'] | null
  answer: string
  tools: string[]
  sources: string[]
  latencyMs: number
  usage: TokenUsage | null
}

const options = (expected: Alternatives) => (Array.isArray(expected) ? expected : [expected])

const describe = (expected: Alternatives) => options(expected).join(' ou ')

const sourcesOf = (response: AskResponse | null): { ref: string; label: string }[] => {
  if (!response) return []
  if (response.mode === 'llm') return response.citations
  return response.sources.map((hit) => ({ ref: hit.source, label: hit.source }))
}

const shortest = (source: { ref: string; label: string }) =>
  source.label.length <= source.ref.length ? source.label : source.ref

const citedAs = (source: { ref: string; label: string }, expected: string) => {
  const target = normalize(expected)
  return normalize(source.ref) === target || normalize(source.label) === target
}

const answered = (observation: Observation): CheckResult => {
  if (observation.error) return { name: 'resposta', ok: false, detail: observation.error }
  if (!observation.response) {
    return { name: 'resposta', ok: false, detail: 'o modelo parou no meio da resposta' }
  }
  if (observation.response.mode === 'retrieval') {
    return { name: 'resposta', ok: false, detail: 'caiu no modo busca, o modelo não respondeu' }
  }
  return { name: 'resposta', ok: true, detail: 'respondida pelo modelo' }
}

const toolCheck = (expected: string[], called: string[]): CheckResult => {
  const ok = called.some((tool) => expected.includes(tool))
  const seen = called.length ? called.join(', ') : 'nenhuma'
  return { name: 'ferramenta', ok, detail: `esperava ${expected.join(' ou ')}; chamou ${seen}` }
}

const sourceCheck = (expected: Alternatives[], response: AskResponse | null): CheckResult => {
  const cited = sourcesOf(response)
  const missing = expected.filter(
    (wanted) => !options(wanted).some((option) => cited.some((source) => citedAs(source, option))),
  )
  return {
    name: 'fontes',
    ok: missing.length === 0,
    detail: missing.length ? `faltou citar ${missing.map(describe).join('; ')}` : 'fontes citadas',
  }
}

const phraseCheck = (expected: Alternatives[], answer: string): CheckResult => {
  const text = normalize(answer)
  const missing = expected.filter(
    (wanted) => !options(wanted).some((option) => text.includes(normalize(option))),
  )
  return {
    name: 'frases',
    ok: missing.length === 0,
    detail: missing.length ? `faltou ${missing.map(describe).join('; ')}` : 'frases esperadas',
  }
}

const forbiddenCheck = (forbidden: string[], answer: string): CheckResult => {
  const text = normalize(answer)
  const found = forbidden.filter((phrase) => text.includes(normalize(phrase)))
  return {
    name: 'proibidas',
    ok: found.length === 0,
    detail: found.length ? `apareceu ${found.join('; ')}` : 'nenhuma frase proibida',
  }
}

const privacyCheck = (hidden: string[], observation: Observation): CheckResult => {
  const sent = observation.modelInputs.join('\n').toLowerCase()
  const answer = observation.response?.answer.toLowerCase() ?? ''
  const leaked = hidden.filter((value) => {
    const target = value.toLowerCase()
    return sent.includes(target) || answer.includes(target)
  })
  return {
    name: 'dado-pessoal',
    ok: leaked.length === 0,
    detail: leaked.length ? `chegou ao modelo ${leaked.join('; ')}` : 'dado pessoal mascarado',
  }
}

/** Scores one golden question: every expectation the case declares must hold. */
export const evaluateCase = (golden: GoldenCase, observation: Observation): CaseResult => {
  const answer = observation.response?.answer ?? ''
  const { expect } = golden
  const checks = [
    answered(observation),
    expect.tools.length ? toolCheck(expect.tools, observation.tools) : null,
    expect.sources.length ? sourceCheck(expect.sources, observation.response) : null,
    expect.include.length ? phraseCheck(expect.include, answer) : null,
    expect.exclude.length ? forbiddenCheck(expect.exclude, answer) : null,
    expect.hiddenFromModel.length ? privacyCheck(expect.hiddenFromModel, observation) : null,
  ].filter((check): check is CheckResult => check !== null)

  return {
    id: golden.id,
    category: golden.category,
    question: golden.question,
    passed: checks.every((check) => check.ok),
    checks,
    mode: observation.response?.mode ?? null,
    answer,
    tools: [...new Set(observation.tools)],
    sources: sourcesOf(observation.response).map(shortest),
    latencyMs: observation.latencyMs,
    usage: observation.usage,
  }
}
