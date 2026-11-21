import { Controller, Get, Inject, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { ReadinessResponse } from '@lab/contracts'
import type { Response } from 'express'
import { Public } from '../auth/public.decorator.js'
import { ReadinessService } from './readiness.service.js'

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Public()
  @Get()
  health() {
    return { status: 'ok' }
  }

  /** Readiness probe: 503 while any check fails, with no secret or connection detail. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.readiness.check()
    if (result.status !== 'ready') response.status(503)
    return result
  }
}
