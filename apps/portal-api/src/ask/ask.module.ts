import { Module } from '@nestjs/common'
import { HandbookModule } from '../handbook/handbook.module.js'
import { AskController } from './ask.controller.js'
import { AskService } from './ask.service.js'

@Module({ imports: [HandbookModule], controllers: [AskController], providers: [AskService] })
export class AskModule {}
