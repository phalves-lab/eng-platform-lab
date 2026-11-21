import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { BoardsController } from './boards.controller.js'
import { FlowController } from './flow.controller.js'
import { FLOW_CLOCK, FlowService } from './flow.service.js'
import { JIRA_DATA, createJiraData } from './jira-data.js'

@Module({
  controllers: [FlowController, BoardsController],
  providers: [
    FlowService,
    {
      provide: JIRA_DATA,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createJiraData(config.panelSource),
    },
    { provide: FLOW_CLOCK, useValue: () => new Date() },
  ],
  exports: [JIRA_DATA, FlowService],
})
export class FlowModule {}
