import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { DoraModule } from '../dora/dora.module.js'
import { FlowModule } from '../flow/flow.module.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { ReviewModule } from '../review/review.module.js'
import { loadProjectCatalog } from './catalog.js'
import { ProjectsController } from './projects.controller.js'
import { PROJECTS_CLOCK, PROJECT_CATALOG, ProjectsService } from './projects.service.js'

@Module({
  imports: [HandbookModule, FlowModule, ReviewModule, DoraModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: PROJECT_CATALOG,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => loadProjectCatalog(config.projectsDir),
    },
    { provide: PROJECTS_CLOCK, useValue: () => new Date() },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
