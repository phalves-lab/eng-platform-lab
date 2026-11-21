import { Controller, Get, Query } from '@nestjs/common'
import {
  type FlowMetricsQuery,
  FlowMetricsQuerySchema,
  type FlowMetricsResponse,
} from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { FlowService } from './flow.service.js'

@Controller('api/metrics/flow')
export class FlowController {
  constructor(private readonly flow: FlowService) {}

  @Get()
  metrics(
    @Query(new ZodPipe(FlowMetricsQuerySchema)) query: FlowMetricsQuery,
  ): Promise<FlowMetricsResponse> {
    return this.flow.flow(query)
  }
}
