import { AiUsageRepository, EvalRunRepository, type Pool } from '@lab/database'
import { loadPricing } from '@lab/llm-usage'
import type { AiQualityConfig } from '../../config.js'
import { createAiQualityCollector } from './collector.js'
import { createFixtureArtifactSource } from './fixture-source.js'
import { createGitHubArtifactSource } from './github-source.js'

export const buildAiQualityCollector = async (
  config: AiQualityConfig,
  pool: Pool,
  intervalMs: number,
) =>
  createAiQualityCollector({
    source:
      config.source.kind === 'fixture'
        ? createFixtureArtifactSource(config.source.dir)
        : createGitHubArtifactSource(config.source),
    runs: new EvalRunRepository(pool),
    usage: new AiUsageRepository(pool),
    pricing: await loadPricing(config.pricingFile),
    intervalMs,
  })
