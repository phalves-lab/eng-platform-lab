import { Controller, Get, Param, Query } from '@nestjs/common'
import {
  type ProjectDetail,
  ProjectIdParamSchema,
  type ProjectListQuery,
  ProjectListQuerySchema,
  type ProjectSummary,
} from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { ProjectsService } from './projects.service.js'

/** Read-only projects of the catalog; nothing here writes to Jira or GitHub. */
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Query(new ZodPipe(ProjectListQuerySchema)) query: ProjectListQuery,
  ): Promise<ProjectSummary[]> {
    return this.projects.list(query.term)
  }

  @Get(':id')
  detail(@Param('id', new ZodPipe(ProjectIdParamSchema)) id: string): Promise<ProjectDetail> {
    return this.projects.detail(id)
  }
}
