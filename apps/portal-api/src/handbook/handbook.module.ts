import { Module } from '@nestjs/common'
import { HandbookController } from './handbook.controller.js'
import { HandbookService } from './handbook.service.js'

@Module({
  controllers: [HandbookController],
  providers: [HandbookService],
  exports: [HandbookService],
})
export class HandbookModule {}
