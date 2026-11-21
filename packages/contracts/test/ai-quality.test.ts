import { describe, expect, it } from 'vitest'
import {
  AiArtifactSchema,
  AiQualityQuerySchema,
  AiUsageRecordSchema,
  EvalRunSchema,
} from '../src/index.js'

const usage = {
  id: 'chat-0001-abcdef',
  occurredAt: '2026-11-20T12:00:00.000Z',
  origin: 'chat',
  model: 'gemini-2.5-flash',
  inputTokens: 1200,
  outputTokens: 300,
}

const run = {
  id: 'bot-20261120-abc1234',
  suite: 'bot',
  runAt: '2026-11-20T12:00:00.000Z',
  commit: 'abc1234',
  model: 'gemini-2.5-pro',
  promptVersion: '1.1.0',
  offline: false,
  total: 10,
  passed: 8,
  inputTokens: 1000,
  outputTokens: 200,
  latencyMs: { p50: 1200, max: 4000 },
  cases: [{ id: '001', passed: true, latencyMs: 900, inputTokens: 100, outputTokens: 20 }],
}

describe('AI quality contracts', () => {
  it('fills the optional fields of a usage record with null', () => {
    expect(AiUsageRecordSchema.parse(usage)).toMatchObject({
      costUsd: null,
      team: null,
      skill: null,
      repository: null,
      pullRequest: null,
      runId: null,
    })
  })

  it('refuses personal data and text in a usage record', () => {
    expect(AiUsageRecordSchema.safeParse({ ...usage, login: 'pessoa.lab' }).success).toBe(false)
    expect(AiUsageRecordSchema.safeParse({ ...usage, question: 'oi' }).success).toBe(false)
    expect(AiUsageRecordSchema.safeParse({ ...usage, inputTokens: -1 }).success).toBe(false)
    expect(AiUsageRecordSchema.safeParse({ ...usage, id: 'curto' }).success).toBe(false)
  })

  it('keeps passed within total and accepts an unknown commit', () => {
    expect(EvalRunSchema.safeParse(run).success).toBe(true)
    expect(EvalRunSchema.safeParse({ ...run, commit: 'desconhecido' }).success).toBe(true)
    expect(EvalRunSchema.safeParse({ ...run, passed: 11 }).success).toBe(false)
    expect(EvalRunSchema.safeParse({ ...run, commit: 'main' }).success).toBe(false)
  })

  it('tells the artifact kinds apart and pins the schema version', () => {
    const parsed = AiArtifactSchema.parse({ schemaVersion: 1, kind: 'eval-run', run })
    expect(parsed.kind).toBe('eval-run')
    expect(
      AiArtifactSchema.parse({ schemaVersion: 1, kind: 'ai-usage', records: [usage] }).kind,
    ).toBe('ai-usage')
    expect(AiArtifactSchema.safeParse({ schemaVersion: 2, kind: 'eval-run', run }).success).toBe(
      false,
    )
  })

  it('bounds the window of the AI quality query', () => {
    expect(AiQualityQuerySchema.parse({ days: '30' })).toEqual({ days: 30 })
    expect(AiQualityQuerySchema.safeParse({ days: 3 }).success).toBe(false)
  })
})
