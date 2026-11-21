import { fileURLToPath } from 'node:url'
import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  evalRunArtifact,
  mergeArtifacts,
  parseArtifact,
  readArtifactDir,
  usageArtifact,
} from '../src/index.js'

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ai-evals', import.meta.url))

const run: EvalRun = {
  id: 'chat-2026-11-20-abc1234',
  suite: 'chat',
  runAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  model: 'gemini-2.5-flash',
  promptVersion: 'chat-2',
  offline: false,
  total: 2,
  passed: 1,
  inputTokens: 10,
  outputTokens: 5,
  latencyMs: { p50: 100, max: 200 },
  cases: [],
}

const record: AiUsageRecord = {
  id: 'chat-0001-abcdef',
  occurredAt: '2026-11-20T12:00:00.000Z',
  origin: 'chat',
  model: 'gemini-2.5-flash',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: null,
  pricingVersion: null,
  team: null,
  skill: null,
  repository: null,
  pullRequest: null,
  runId: null,
}

describe('AI artifacts', () => {
  it('round-trips what the runners write', () => {
    const runFile = parseArtifact('run.json', JSON.stringify(evalRunArtifact(run)))
    const usageFile = parseArtifact('usage.json', JSON.stringify(usageArtifact([record])))
    expect(mergeArtifacts([runFile, usageFile])).toEqual({
      runs: [run],
      usage: [record],
      invalid: [],
    })
  })

  it('keeps broken files as errors and the first copy of a repeated id', () => {
    const merged = mergeArtifacts([
      parseArtifact('broken.json', '{'),
      parseArtifact('wrong.json', JSON.stringify({ schemaVersion: 1, kind: 'outro' })),
      parseArtifact('a.json', JSON.stringify(evalRunArtifact(run))),
      parseArtifact('b.json', JSON.stringify(evalRunArtifact({ ...run, passed: 2 }))),
      parseArtifact('c.json', JSON.stringify(usageArtifact([record, { ...record, model: 'x' }]))),
    ])
    expect(merged.invalid.map((item) => item.name)).toEqual(['broken.json', 'wrong.json'])
    expect(merged.runs).toEqual([run])
    expect(merged.usage).toEqual([record])
  })

  it('reads the synthetic fixtures without errors', async () => {
    const batch = await readArtifactDir(FIXTURES)
    expect(batch.invalid).toEqual([])
    expect(new Set(batch.runs.map((item) => item.suite))).toEqual(new Set(['bot', 'chat']))
    expect(new Set(batch.usage.map((item) => item.origin))).toEqual(
      new Set(['bot', 'chat', 'golden-set']),
    )
  })
})
