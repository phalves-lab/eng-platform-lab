import { Controller, Get, Query } from '@nestjs/common'
import {
  type ReviewMetricsQuery,
  ReviewMetricsQuerySchema,
  type ReviewMetricsResponse,
} from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { ReviewService } from '../review/review.service.js'

@Controller('api/metrics')
export class MetricsController {
  constructor(private readonly review: ReviewService) {}

  @Get('review')
  async reviewMetrics(
    @Query(new ZodPipe(ReviewMetricsQuerySchema)) query: ReviewMetricsQuery,
  ): Promise<ReviewMetricsResponse> {
    const { title, generatedAt, metrics, trend, alerts } = await this.review.dataset(query.dataset)
    return { dataset: query.dataset, title, generatedAt, metrics, trend, alerts }
  }
}
