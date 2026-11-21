import { Global, Module } from '@nestjs/common'
import { loadPricing } from '@lab/llm-usage'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { AI_PRICING, AI_USAGE_SINK, createUsageSink } from './usage-sink.js'

@Global()
@Module({
  providers: [
    {
      provide: AI_PRICING,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => loadPricing(config.ai.pricingFile),
    },
    { provide: AI_USAGE_SINK, inject: [CONFIG], useFactory: createUsageSink },
  ],
  exports: [AI_PRICING, AI_USAGE_SINK],
})
export class AiUsageModule {}
