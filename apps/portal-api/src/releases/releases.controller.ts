import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import {
  type ReleaseExecuteRequest,
  ReleaseExecuteRequestSchema,
  type ReleasePlanRequest,
  ReleasePlanRequestSchema,
  type ReleasePreviewQuery,
  ReleasePreviewQuerySchema,
  type ReleaseProjectQuery,
  ReleaseProjectQuerySchema,
  type ReleasePublishExecute,
  ReleasePublishExecuteSchema,
  type ReleasePublishRequest,
  ReleasePublishRequestSchema,
  type ReleaseSide,
  ReleaseSideSchema,
  type User,
} from '@lab/contracts'
import { z } from 'zod'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ReleaseWriteService } from './release-write.service.js'
import { ReleasesService } from './releases.service.js'

const BranchesQuerySchema = z.object({ side: ReleaseSideSchema })

/** Every GitHub-backed route shares a tighter limit than the rest of the API. */
@Controller('api/releases')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ReleasesController {
  constructor(
    private readonly releases: ReleasesService,
    private readonly writes: ReleaseWriteService,
  ) {}

  @Get('projects')
  projects() {
    return this.releases.projects()
  }

  @Get('projects/:id/branches')
  branches(
    @Param('id') id: string,
    @Query(new ZodPipe(BranchesQuerySchema)) query: { side: ReleaseSide },
  ) {
    return this.releases.branches(id, query.side)
  }

  @Get('preview')
  preview(@Query(new ZodPipe(ReleasePreviewQuerySchema)) query: ReleasePreviewQuery) {
    return this.releases.preview(query)
  }

  @Post('plan')
  @HttpCode(200)
  plan(
    @CurrentUser() user: User,
    @Body(new ZodPipe(ReleasePlanRequestSchema)) body: ReleasePlanRequest,
  ) {
    return this.writes.plan(user, body)
  }

  @Post('execute')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  execute(
    @CurrentUser() user: User,
    @Body(new ZodPipe(ReleaseExecuteRequestSchema)) body: ReleaseExecuteRequest,
  ) {
    return this.writes.execute(user, body)
  }

  @Post('publish/plan')
  @HttpCode(200)
  publishPlan(
    @CurrentUser() user: User,
    @Body(new ZodPipe(ReleasePublishRequestSchema)) body: ReleasePublishRequest,
  ) {
    return this.writes.publishPlan(user, body)
  }

  @Post('publish/execute')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  publishExecute(
    @CurrentUser() user: User,
    @Body(new ZodPipe(ReleasePublishExecuteSchema)) body: ReleasePublishExecute,
  ) {
    return this.writes.publishExecute(user, body)
  }

  @Get('tracking')
  tracking(@Query(new ZodPipe(ReleaseProjectQuerySchema)) query: ReleaseProjectQuery) {
    return this.writes.tracking(query.project)
  }

  @Get('history')
  history(@Query(new ZodPipe(ReleaseProjectQuerySchema)) query: ReleaseProjectQuery) {
    return this.writes.history(query.project)
  }
}
