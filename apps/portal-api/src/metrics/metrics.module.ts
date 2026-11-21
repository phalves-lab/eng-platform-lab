import { Module } from '@nestjs/common'
import { ReviewModule } from '../review/review.module.js'
import { MetricsController } from './metrics.controller.js'

@Module({ imports: [ReviewModule], controllers: [MetricsController] })
export class MetricsModule {}
