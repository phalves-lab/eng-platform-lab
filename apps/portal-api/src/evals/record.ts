import { execFileSync } from 'node:child_process'
import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { AiUsageRepository, EvalRunRepository, createPool } from '@lab/database'
import type { GoldenSetReport } from './report.js'

const SHA = /^[0-9a-f]{7,40}$/

/** Version declared in the title of `prompts/chat.md`, such as `(versão 2)`. */
export const promptVersionOf = (systemPrompt: string) =>
  /\(vers[aã]o\s+([\w.-]+)\)/i.exec(systemPrompt)?.[1] ?? 'sem-versão'

/** Commit under evaluation: `GITHUB_SHA` in CI, otherwise the checkout HEAD when there is one. */
export const commitOf = (env: NodeJS.ProcessEnv, cwd: string): string => {
  if (env.GITHUB_SHA && SHA.test(env.GITHUB_SHA)) return env.GITHUB_SHA
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
    return SHA.test(head) ? head : 'desconhecido'
  } catch {
    return 'desconhecido'
  }
}

export const chatRunId = (runAt: Date, commit: string) =>
  `chat-${runAt.toISOString().replace(/[-:]|\.\d+/g, '')}-${commit.slice(0, 7)}`

export interface RunIdentity {
  id: string
  commit: string
  promptVersion: string
}

/** The chat golden set report in the artifact format collected by the portal worker. */
export const toEvalRun = (report: GoldenSetReport, identity: RunIdentity): EvalRun => ({
  id: identity.id,
  suite: 'chat',
  runAt: report.generatedAt,
  commit: identity.commit,
  model: report.model,
  promptVersion: identity.promptVersion,
  offline: report.offline,
  total: report.total,
  passed: report.passed,
  inputTokens: report.tokens?.prompt ?? null,
  outputTokens: report.tokens?.completion ?? null,
  latencyMs: report.total ? report.latencyMs : null,
  cases: report.results.map((result) => ({
    id: result.id,
    passed: result.passed,
    latencyMs: result.latencyMs,
    inputTokens: result.usage?.promptTokens ?? null,
    outputTokens: result.usage?.completionTokens ?? null,
  })),
})

/** With `DATABASE_URL`, the runner also stores the run and its usage next to the CI data. */
export const saveToDatabase = async (
  url: string,
  run: EvalRun,
  usage: AiUsageRecord[],
): Promise<void> => {
  const pool = createPool({ connectionString: url, applicationName: 'chat-evals', max: 1 })
  try {
    await new EvalRunRepository(pool).save([run], 'local')
    await new AiUsageRepository(pool).record(usage)
  } finally {
    await pool.end()
  }
}
