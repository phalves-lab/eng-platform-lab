import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { PeopleModule } from '../people/people.module.js'
import { ReviewModule } from '../review/review.module.js'
import { WORK_DATA, createWorkData } from './work-data.js'
import { WorkController } from './work.controller.js'
import { WORK_CLOCK, WorkService } from './work.service.js'

@Module({
  imports: [PeopleModule, ReviewModule],
  controllers: [WorkController],
  providers: [
    WorkService,
    {
      provide: WORK_DATA,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createWorkData(config.panelSource),
    },
    { provide: WORK_CLOCK, useValue: () => new Date() },
  ],
})
export class WorkModule {}
