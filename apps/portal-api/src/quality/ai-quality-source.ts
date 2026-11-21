import { type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import type { AiUsageRecord, EvalRun } from '@lab/contracts'
import { AiUsageRepository, EvalRunRepository, type Pool, createPool } from '@lab/database'
import { type Pricing, priceRecord, readArtifactDir } from '@lab/llm-usage'
import type { PortalConfig } from '../config/config.js'

export const AI_QUALITY_SOURCE = Symbol('AI_QUALITY_SOURCE')

export interface AiQualityData {
  runs: EvalRun[]
  usage: AiUsageRecord[]
}

export interface AiQualitySource {
  load: (since: string) => Promise<AiQualityData>
}

const UNDEFINED_TABLE = '42P01'

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

/** Reads what the worker collected from CI and what the chat recorded. */
export class DatabaseAiQualitySource implements AiQualitySource, OnModuleDestroy {
  private readonly runs: Pick<EvalRunRepository, 'list'>
  private readonly usage: Pick<AiUsageRepository, 'list'>

  constructor(private readonly pool: Pool) {
    this.runs = new EvalRunRepository(pool)
    this.usage = new AiUsageRepository(pool)
  }

  async load(since: string): Promise<AiQualityData> {
    try {
      const [runs, usage] = await Promise.all([this.runs.list(since), this.usage.list(since)])
      return { runs, usage }
    } catch (error) {
      if (isUndefinedTable(error)) {
        throw new ServiceUnavailableException('AI quality data is not available yet')
      }
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}

/** Lab mode without a database: the synthetic artifacts of `fixtures/ai-evals`, priced on read. */
export class FixtureAiQualitySource implements AiQualitySource {
  private data: Promise<AiQualityData> | null = null

  constructor(
    private readonly directory: string,
    private readonly pricing: Pricing,
  ) {}

  load(): Promise<AiQualityData> {
    this.data ??= readArtifactDir(this.directory).then((batch) => ({
      runs: batch.runs,
      usage: batch.usage.map((record) => priceRecord(this.pricing, record)),
    }))
    return this.data
  }
}

export const createAiQualitySource = (config: PortalConfig, pricing: Pricing): AiQualitySource =>
  config.panelSource.kind === 'database'
    ? new DatabaseAiQualitySource(
        createPool({
          connectionString: config.panelSource.url,
          applicationName: 'portal-api-ai-quality',
          max: 2,
        }),
      )
    : new FixtureAiQualitySource(config.ai.evalsDir, pricing)
