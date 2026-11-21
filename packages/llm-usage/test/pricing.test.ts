import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AiUsageRecord } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  AiConfigError,
  type Pricing,
  estimateCost,
  findPrice,
  loadPricing,
  loadQualityConfig,
  priceRecord,
} from '../src/index.js'

const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))

const pricing: Pricing = {
  version: 'v-teste',
  currency: 'USD',
  models: [
    { model: 'gemini-2.5-flash', inputPerMillion: 0.3, outputPerMillion: 2.5 },
    { model: 'gemini-2.5-flash-lite', inputPerMillion: 0.1, outputPerMillion: 0.4 },
  ],
}

const record = (overrides: Partial<AiUsageRecord> = {}): AiUsageRecord => ({
  id: 'chat-0001-abcdef',
  occurredAt: '2026-11-20T12:00:00.000Z',
  origin: 'chat',
  model: 'gemini-2.5-flash',
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  costUsd: null,
  pricingVersion: null,
  team: null,
  skill: null,
  repository: null,
  pullRequest: null,
  runId: null,
  ...overrides,
})

const tempFile = async (content: string) => {
  const directory = await mkdtemp(join(tmpdir(), 'llm-usage-'))
  const file = join(directory, 'config.yaml')
  await writeFile(file, content)
  return file
}

describe('price table', () => {
  it('loads the versioned tables of the repository', async () => {
    const versioned = await loadPricing(repoPath('catalog/ai/pricing.yaml'))
    expect(versioned.currency).toBe('USD')
    expect(versioned.models.length).toBeGreaterThan(0)
    const quality = await loadQualityConfig(repoPath('catalog/ai/quality.yaml'))
    expect(quality.precision.bot).toBeGreaterThan(0)
    expect(quality.precision.chat).toBeGreaterThan(0)
  })

  it('rejects repeated models and thresholds out of range', async () => {
    const repeated = await tempFile(
      [
        "version: 'x'",
        'currency: USD',
        'models:',
        '  - { model: a, inputPerMillion: 1, outputPerMillion: 1 }',
        '  - { model: a, inputPerMillion: 2, outputPerMillion: 2 }',
      ].join('\n'),
    )
    await expect(loadPricing(repeated)).rejects.toThrow(AiConfigError)
    const threshold = await tempFile('precision: { bot: 1.2, chat: 0.8 }')
    await expect(loadQualityConfig(threshold)).rejects.toThrow(AiConfigError)
  })

  it('drops gateway prefixes and falls back to the longest listed prefix', () => {
    expect(findPrice(pricing, 'models/gemini-2.5-flash')?.model).toBe('gemini-2.5-flash')
    expect(findPrice(pricing, 'gemini/Gemini-2.5-Flash-Lite')?.model).toBe('gemini-2.5-flash-lite')
    expect(findPrice(pricing, 'gemini-2.5-flash-lite-preview-06')?.model).toBe(
      'gemini-2.5-flash-lite',
    )
    expect(findPrice(pricing, 'gemini-2.5-flash-preview-05')?.model).toBe('gemini-2.5-flash')
    expect(findPrice(pricing, 'gemini-2.5-flashy')).toBeNull()
    expect(findPrice(pricing, 'outro-modelo')).toBeNull()
  })

  it('estimates input and output tokens with their own price, rounded to micro dollars', () => {
    expect(estimateCost(pricing, 'gemini-2.5-flash', 1_000_000, 100_000)).toBeCloseTo(0.55, 6)
    expect(estimateCost(pricing, 'gemini-2.5-flash', 1, 1)).toBeCloseTo(0.000003, 9)
    expect(estimateCost(pricing, 'outro-modelo', 10, 10)).toBeNull()
  })

  it('prices a record once and keeps a cost that arrived priced', () => {
    expect(priceRecord(pricing, record())).toMatchObject({
      costUsd: 0.55,
      pricingVersion: 'v-teste',
    })
    const priced = record({ costUsd: 1, pricingVersion: 'antiga' })
    expect(priceRecord(pricing, priced)).toBe(priced)
    expect(priceRecord(pricing, record({ model: 'sem-preco' }))).toMatchObject({
      costUsd: null,
      pricingVersion: null,
    })
  })
})
