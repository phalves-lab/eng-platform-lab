import { randomUUID } from 'node:crypto'
import { Logger } from '@nestjs/common'
import type { AiOrigin, AiUsageRecord } from '@lab/contracts'
import { type Pricing, priceRecord } from '@lab/llm-usage'
import type { PortalConfig } from '../../config/config.js'
import type { ModelProvider, ModelRequest, ModelTurn, TokenUsage } from './model-provider.js'
import { OpenAICompatibleProvider } from './openai-compatible.provider.js'

/** Where usage records go: the database in the portal, memory in the golden set runner. */
export interface UsageSink {
  record: (records: AiUsageRecord[]) => Promise<unknown>
}

export interface RecordingOptions {
  origin: AiOrigin
  pricing: Pricing
  runId?: string | null
  now?: () => Date
}

/**
 * Wraps a provider to keep one usage record per model call that reported tokens. The record
 * holds ids and counts only, and a failing sink is logged without touching the answer.
 */
export class RecordingProvider implements ModelProvider {
  private readonly logger = new Logger('AiUsage')

  constructor(
    private readonly inner: ModelProvider,
    private readonly sink: UsageSink,
    private readonly options: RecordingOptions,
  ) {}

  get model() {
    return this.inner.model
  }

  async complete(request: ModelRequest): Promise<ModelTurn> {
    const turn = await this.inner.complete(request)
    if (turn.usage) this.save(turn.usage)
    return turn
  }

  private save(usage: TokenUsage) {
    const record = priceRecord(this.options.pricing, {
      id: randomUUID(),
      occurredAt: (this.options.now?.() ?? new Date()).toISOString(),
      origin: this.options.origin,
      model: this.inner.model,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      costUsd: null,
      pricingVersion: null,
      team: null,
      skill: null,
      repository: null,
      pullRequest: null,
      runId: this.options.runId ?? null,
    })
    this.sink.record([record]).catch((error: unknown) => {
      this.logger.warn(`usage record lost: ${error instanceof Error ? error.message : error}`)
    })
  }
}

/** Keeps the records in memory, for the golden set runner to write them to a file. */
export class MemoryUsageSink implements UsageSink {
  readonly records: AiUsageRecord[] = []

  record(records: AiUsageRecord[]): Promise<void> {
    this.records.push(...records)
    return Promise.resolve()
  }
}

/** The chat model of the portal, recording its usage when a database is configured. */
export const createModelProvider = (
  config: Pick<PortalConfig, 'llm'>,
  pricing: Pricing,
  sink: UsageSink | null,
): ModelProvider | null => {
  if (!config.llm) return null
  const provider = new OpenAICompatibleProvider({
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
  })
  return sink ? new RecordingProvider(provider, sink, { origin: 'chat', pricing }) : provider
}
