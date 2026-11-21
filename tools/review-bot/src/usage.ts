import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  AI_ARTIFACT_VERSION,
  type AiArtifact,
  AiArtifactSchema,
  type AiUsageRecord,
  type EvalCaseOutcome,
  type EvalRun,
} from '@lab/contracts'
import type { TokenUsage } from './llm/gemini.js'

const TEAM_HANDLE = /^@[\w.-]+\/[\w.-]+$/

/** Owner of the first affected module, when it is a team handle; a personal login is dropped. */
export const teamOf = (owners: string[]): string | null =>
  owners.find((owner) => TEAM_HANDLE.test(owner)) ?? null

type UsageContext = Pick<AiUsageRecord, 'origin' | 'team' | 'repository' | 'pullRequest' | 'runId'>

/** Collects one record per model call, with ids and token counts only. */
export class UsageLog {
  private readonly records: AiUsageRecord[] = []

  constructor(
    private readonly model: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  add(context: UsageContext, usage: TokenUsage): void {
    this.records.push({
      id: randomUUID(),
      occurredAt: this.now().toISOString(),
      model: this.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: null,
      pricingVersion: null,
      skill: null,
      ...context,
    })
  }

  artifact(): AiArtifact {
    return AiArtifactSchema.parse({
      schemaVersion: AI_ARTIFACT_VERSION,
      kind: 'ai-usage',
      records: this.records,
    })
  }
}

/** Latency and tokens of the golden set case being scored. */
export class CaseMeter {
  private tokens: TokenUsage | null = null
  private started = 0

  constructor(private readonly clock: () => number = () => performance.now()) {}

  start(): void {
    this.tokens = null
    this.started = this.clock()
  }

  add(usage: TokenUsage): void {
    this.tokens = {
      inputTokens: (this.tokens?.inputTokens ?? 0) + usage.inputTokens,
      outputTokens: (this.tokens?.outputTokens ?? 0) + usage.outputTokens,
    }
  }

  finish(id: string, passed: boolean): EvalCaseOutcome {
    return {
      id,
      passed,
      latencyMs: Math.max(0, Math.round(this.clock() - this.started)),
      inputTokens: this.tokens?.inputTokens ?? null,
      outputTokens: this.tokens?.outputTokens ?? null,
    }
  }
}

export interface EvalRunInput {
  runAt: Date
  commit: string
  model: string
  promptVersion: string
  cases: EvalCaseOutcome[]
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[middle] ?? 0
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

const sumOf = (values: (number | null)[]) =>
  values.some((value) => value !== null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null

export const evalRunId = (runAt: Date, commit: string) =>
  `bot-${runAt.toISOString().replace(/[-:]|\.\d+/g, '')}-${commit.slice(0, 7)}`

/** Golden set result of the bot in the artifact format the portal worker collects. */
export const buildEvalRun = (input: EvalRunInput): EvalRun => {
  const latencies = input.cases.flatMap((item) => (item.latencyMs === null ? [] : [item.latencyMs]))
  return {
    id: evalRunId(input.runAt, input.commit),
    suite: 'bot',
    runAt: input.runAt.toISOString(),
    commit: input.commit,
    model: input.model,
    promptVersion: input.promptVersion,
    offline: false,
    total: input.cases.length,
    passed: input.cases.filter((item) => item.passed).length,
    inputTokens: sumOf(input.cases.map((item) => item.inputTokens)),
    outputTokens: sumOf(input.cases.map((item) => item.outputTokens)),
    latencyMs: latencies.length ? { p50: median(latencies), max: Math.max(...latencies) } : null,
    cases: input.cases,
  }
}

export const evalRunArtifact = (run: EvalRun): AiArtifact =>
  AiArtifactSchema.parse({ schemaVersion: AI_ARTIFACT_VERSION, kind: 'eval-run', run })

export const writeArtifact = async (path: string, artifact: AiArtifact) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`)
}
