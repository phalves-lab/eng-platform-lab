import type { AiUsageRepository, EvalRunRepository } from '@lab/database'
import { type Pricing, mergeArtifacts, priceRecord } from '@lab/llm-usage'
import type { Collector } from '../../collector.js'
import type { AiArtifactSource } from './source.js'

export interface AiQualityCollectorOptions {
  source: AiArtifactSource
  runs: Pick<EvalRunRepository, 'save'>
  usage: Pick<AiUsageRepository, 'record'>
  pricing: Pricing
  intervalMs: number
}

/**
 * Stores the golden set runs and the usage records found in the artifacts, pricing the records
 * that arrived with tokens only. Ids make the run idempotent; a broken artifact is logged and
 * skipped, and download failures fail the run at the end so the scheduler reports it.
 */
export const createAiQualityCollector = (options: AiQualityCollectorOptions): Collector => ({
  name: 'ai-quality',
  schedule: { intervalMs: options.intervalMs },
  run: async ({ logger }) => {
    const collected = await options.source.collect()
    const batch = mergeArtifacts(collected.parsed)
    for (const item of batch.invalid) {
      logger.warn('ai-quality.artifact.invalid', { artifact: item.name, error: item.error })
    }
    const runs = await options.runs.save(batch.runs, collected.source)
    const usage = await options.usage.record(
      batch.usage.map((record) => priceRecord(options.pricing, record)),
    )
    logger.info('ai-quality.saved', {
      source: collected.source,
      runs: batch.runs.length,
      runsWritten: runs,
      usage: batch.usage.length,
      usageWritten: usage,
      invalid: batch.invalid.length,
    })
    if (collected.failures.length) {
      logger.error('ai-quality.download.failed', { failures: collected.failures })
      throw new Error(`Coleta de IA falhou em ${collected.failures.length} artefato(s)`)
    }
  },
})
