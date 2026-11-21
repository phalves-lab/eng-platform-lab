import { Controller, Get, Param, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import {
  type ReleasePreviewQuery,
  ReleasePreviewQuerySchema,
  type ReleaseSide,
  ReleaseSideSchema,
} from '@lab/contracts'
import { z } from 'zod'
import { ZodPipe } from '../common/zod.pipe.js'
import { ReleasesService } from './releases.service.js'

const BranchesQuerySchema = z.object({ side: ReleaseSideSchema })

/** Every GitHub-backed route shares a tighter limit than the rest of the API. */
@Controller('api/releases')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

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
}
