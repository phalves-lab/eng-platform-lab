import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { CLOCK, systemClock } from './clock.js'
import { DocsService } from './docs.service.js'
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
    ScorecardService,
    DocsService,
  ],
})
export class QualityModule {}
