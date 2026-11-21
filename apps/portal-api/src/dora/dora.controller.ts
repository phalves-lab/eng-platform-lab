import { Controller, Get, Query } from '@nestjs/common'
import { type DoraMetricsResponse, type DoraQuery, DoraQuerySchema } from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { DoraService } from './dora.service.js'

@Controller('api/metrics')
export class DoraController {
  constructor(private readonly dora: DoraService) {}

  @Get('dora')
  doraMetrics(@Query(new ZodPipe(DoraQuerySchema)) query: DoraQuery): Promise<DoraMetricsResponse> {
    return this.dora.metrics(query)
  }
}
