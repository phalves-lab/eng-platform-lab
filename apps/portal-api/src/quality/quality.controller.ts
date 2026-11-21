import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  type AiQualityQuery,
  AiQualityQuerySchema,
  type AiQualityResponse,
  type DocsQuery,
  DocsQuerySchema,
  type DocsReport,
  type RepoScorecardView,
  type ScorecardFilter,
  ScorecardFilterSchema,
  type ScorecardResponse,
} from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { AiQualityService } from './ai-quality.service.js'
import { DocsService } from './docs.service.js'
import { ScorecardService } from './scorecard.service.js'

@Controller('api/quality')
export class QualityController {
  constructor(
    private readonly scorecard: ScorecardService,
    private readonly docs: DocsService,
    private readonly ai: AiQualityService,
  ) {}

  @Get('scorecard')
  list(
    @Query(new ZodPipe(ScorecardFilterSchema)) filter: ScorecardFilter,
  ): Promise<ScorecardResponse> {
    return this.scorecard.list(filter)
  }

  @Get('scorecard/:id')
  repo(@Param('id') id: string): Promise<RepoScorecardView> {
    return this.scorecard.repo(id)
  }

  @Get('docs')
  docsReport(@Query(new ZodPipe(DocsQuerySchema)) query: DocsQuery): DocsReport {
    return this.docs.report(query.months)
  }

  @Get('ai')
  aiReport(
    @Query(new ZodPipe(AiQualityQuerySchema)) query: AiQualityQuery,
  ): Promise<AiQualityResponse> {
    return this.ai.report(query.days)
  }
}
