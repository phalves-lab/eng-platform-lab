import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AiQualityResponse, GatewaySpend } from '@lab/contracts'
import { type Pricing, type QualityConfig, buildAiQualityReport } from '@lab/llm-usage'
import { AI_PRICING } from '../ai-usage/usage-sink.js'
import { AI_QUALITY_SOURCE, type AiQualitySource } from './ai-quality-source.js'
import { CLOCK, type Clock } from './clock.js'
import { GATEWAY_SPEND, type GatewaySpendSource } from './gateway-spend.js'

export const AI_QUALITY_CONFIG = Symbol('AI_QUALITY_CONFIG')

const DEFAULT_DAYS = 90
const DAY_MS = 86_400_000

/** Precision of the golden sets and AI cost by origin, team and pull request. */
@Injectable()
export class AiQualityService {
  private readonly logger = new Logger('AiQuality')

  constructor(
    @Inject(AI_QUALITY_SOURCE) private readonly source: AiQualitySource,
    @Inject(AI_PRICING) private readonly pricing: Pricing,
    @Inject(AI_QUALITY_CONFIG) private readonly quality: QualityConfig,
    @Inject(GATEWAY_SPEND) private readonly gateway: GatewaySpendSource | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async report(days = DEFAULT_DAYS): Promise<AiQualityResponse> {
    const now = this.clock()
    const since = new Date(now.getTime() - days * DAY_MS).toISOString()
    const [data, gateway] = await Promise.all([this.source.load(since), this.readGateway()])
    return buildAiQualityReport({
      ...data,
      thresholds: this.quality.precision,
      pricingVersion: this.pricing.version,
      gateway,
      now,
      days,
    })
  }

  /** The gateway card is optional: a failed read hides it instead of failing the page. */
  private async readGateway(): Promise<GatewaySpend | null> {
    if (!this.gateway) return null
    try {
      return await this.gateway.read()
    } catch (error) {
      this.logger.warn(
        `gateway spend unavailable: ${error instanceof Error ? error.message : error}`,
      )
      return null
    }
  }
}
