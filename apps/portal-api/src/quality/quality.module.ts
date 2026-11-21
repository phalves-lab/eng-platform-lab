import { Module } from '@nestjs/common'
import { type Pricing, loadQualityConfig } from '@lab/llm-usage'
import { AI_PRICING } from '../ai-usage/usage-sink.js'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { AI_QUALITY_SOURCE, createAiQualitySource } from './ai-quality-source.js'
import { AI_QUALITY_CONFIG, AiQualityService } from './ai-quality.service.js'
import { CLOCK, type Clock, systemClock } from './clock.js'
import { DocsService } from './docs.service.js'
import { GATEWAY_SPEND, createGatewaySpendSource } from './gateway-spend.js'
import { QualityController } from './quality.controller.js'
import { FileScorecardSource, SCORECARD_SOURCE } from './scorecard-source.js'
import { ScorecardService } from './scorecard.service.js'

@Module({
  imports: [HandbookModule],
  controllers: [QualityController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: SCORECARD_SOURCE,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => new FileScorecardSource(config.scorecardData),
    },
    {
      provide: AI_QUALITY_SOURCE,
      inject: [CONFIG, AI_PRICING],
      useFactory: (config: PortalConfig, pricing: Pricing) =>
        createAiQualitySource(config, pricing),
    },
    {
      provide: AI_QUALITY_CONFIG,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => loadQualityConfig(config.ai.qualityFile),
    },
    {
      provide: GATEWAY_SPEND,
      inject: [CONFIG, CLOCK],
      useFactory: (config: PortalConfig, clock: Clock) => createGatewaySpendSource(config, clock),
    },
    ScorecardService,
    DocsService,
    AiQualityService,
  ],
})
export class QualityModule {}
