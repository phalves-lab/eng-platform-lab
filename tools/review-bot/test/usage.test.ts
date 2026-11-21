import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiArtifactSchema } from '@lab/contracts'
import { describe, expect, it, vi } from 'vitest'
import { GeminiProvider } from '../src/llm/gemini.js'
import {
  CaseMeter,
  UsageLog,
  buildEvalRun,
  evalRunArtifact,
  evalRunId,
  teamOf,
  writeArtifact,
} from '../src/usage.js'

const NOW = new Date('2026-11-20T10:15:30.123Z')

const answer = (usageMetadata?: Record<string, number>) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"verdict":"confirmado","reason":"r"}' }] } }],
      ...(usageMetadata ? { usageMetadata } : {}),
    }),
    { status: 200 },
  )

describe('uso de tokens do provedor', () => {
  it('repassa os tokens de cada chamada, somando o raciocínio na saída', async () => {
    const onUsage = vi.fn()
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        answer({ promptTokenCount: 1200, candidatesTokenCount: 80, thoughtsTokenCount: 20 }),
      )
      .mockResolvedValueOnce(answer())
    const provider = new GeminiProvider({ apiKey: 'k', model: 'm', fetchImpl, onUsage })
    expect(await provider.verify('p')).toEqual({ verdict: 'confirmado', reason: 'r' })
    await provider.verify('p')
    expect(onUsage).toHaveBeenCalledTimes(1)
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1200, outputTokens: 100 })
  })
})

describe('registro de uso do bot', () => {
  it('guarda só ids e contagens, no formato que o worker coleta', () => {
    const log = new UsageLog('gemini-2.5-pro', () => NOW)
    log.add(
      {
        origin: 'bot',
        team: '@phalves-lab/campanhas',
        repository: 'lab-demo/campanhas-api',
        pullRequest: 42,
        runId: null,
      },
      { inputTokens: 100, outputTokens: 10 },
    )
    const artifact = log.artifact()
    expect(AiArtifactSchema.parse(artifact)).toEqual(artifact)
    if (artifact.kind !== 'ai-usage') throw new Error('tipo inesperado')
    expect(artifact.records[0]).toMatchObject({
      occurredAt: NOW.toISOString(),
      origin: 'bot',
      model: 'gemini-2.5-pro',
      inputTokens: 100,
      outputTokens: 10,
      costUsd: null,
      pullRequest: 42,
    })
    expect(Object.keys(artifact.records[0] ?? {})).not.toContain('author')
  })

  it('recusa repositório fora do formato em vez de gravar texto livre', () => {
    const log = new UsageLog('m')
    log.add(
      { origin: 'bot', team: null, repository: 'texto livre', pullRequest: null, runId: null },
      { inputTokens: 1, outputTokens: 1 },
    )
    expect(() => log.artifact()).toThrow()
  })

  it('aceita como time só handle de time, nunca login de pessoa', () => {
    expect(teamOf(['@PhAlves23', '@phalves-lab/platform'])).toBe('@phalves-lab/platform')
    expect(teamOf(['@PhAlves23'])).toBeNull()
    expect(teamOf([])).toBeNull()
  })
})

describe('resultado do golden set do bot', () => {
  it('mede latência e tokens de cada caso', () => {
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2500.4)
    const meter = new CaseMeter(clock)
    meter.start()
    meter.add({ inputTokens: 10, outputTokens: 2 })
    meter.add({ inputTokens: 5, outputTokens: 1 })
    expect(meter.finish('001', true)).toEqual({
      id: '001',
      passed: true,
      latencyMs: 1500,
      inputTokens: 15,
      outputTokens: 3,
    })
    const silent = new CaseMeter(() => 0)
    silent.start()
    expect(silent.finish('002', false)).toMatchObject({ inputTokens: null, outputTokens: null })
  })

  it('soma acerto, tokens e latência do run e grava o artefato', async () => {
    const run = buildEvalRun({
      runAt: NOW,
      commit: 'abc1234def',
      model: 'gemini-2.5-pro',
      promptVersion: '1.1.0',
      cases: [
        { id: '001', passed: true, latencyMs: 100, inputTokens: 10, outputTokens: 1 },
        { id: '002', passed: false, latencyMs: 300, inputTokens: null, outputTokens: null },
        { id: '003', passed: true, latencyMs: 200, inputTokens: 5, outputTokens: 2 },
      ],
    })
    expect(run).toMatchObject({
      id: 'bot-20261120T101530Z-abc1234',
      suite: 'bot',
      total: 3,
      passed: 2,
      inputTokens: 15,
      outputTokens: 3,
      latencyMs: { p50: 200, max: 300 },
    })
    const directory = await mkdtemp(join(tmpdir(), 'bot-usage-'))
    const file = join(directory, 'nested', 'run.json')
    await writeArtifact(file, evalRunArtifact(run))
    expect(AiArtifactSchema.parse(JSON.parse(await readFile(file, 'utf8')))).toEqual({
      schemaVersion: 1,
      kind: 'eval-run',
      run,
    })
  })

  it('deixa tokens e latência nulos quando nenhum caso rodou com o modelo', () => {
    const run = buildEvalRun({
      runAt: NOW,
      commit: 'desconhecido',
      model: 'm',
      promptVersion: 'v',
      cases: [
        { id: 'a', passed: true, latencyMs: 4, inputTokens: null, outputTokens: null },
        { id: 'b', passed: true, latencyMs: 2, inputTokens: null, outputTokens: null },
      ],
    })
    expect(run).toMatchObject({ inputTokens: null, outputTokens: null, latencyMs: { p50: 3 } })
    expect(evalRunId(NOW, 'desconhecido')).toBe('bot-20261120T101530Z-desconh')
    expect(buildEvalRun({ ...run, runAt: NOW, cases: [] }).latencyMs).toBeNull()
  })
})
