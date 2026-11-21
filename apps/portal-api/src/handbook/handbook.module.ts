import { Module } from '@nestjs/common'
import { HandbookController } from './handbook.controller.js'
import { HandbookService } from './handbook.service.js'
import { SystemRelationsController } from './system-relations.controller.js'
import { SystemRelationsService } from './system-relations.service.js'

@Module({
  controllers: [HandbookController, SystemRelationsController],
  providers: [HandbookService, SystemRelationsService],
  exports: [HandbookService],
})
export class HandbookModule {}
