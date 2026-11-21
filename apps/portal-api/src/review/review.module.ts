import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { PANEL_SOURCE, createPanelSource } from './panel-source.js'
import { ReviewController } from './review.controller.js'
import { ReviewService } from './review.service.js'

@Module({
  controllers: [ReviewController],
  providers: [
    {
      provide: PANEL_SOURCE,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createPanelSource(config.panelSource),
    },
    ReviewService,
  ],
})
export class ReviewModule {}
