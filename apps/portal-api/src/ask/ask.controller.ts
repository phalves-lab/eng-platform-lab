import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { type AskRequest, AskRequestSchema } from '@lab/contracts'
import { Throttle } from '@nestjs/throttler'
import { ZodPipe } from '../common/zod.pipe.js'
import { AskService } from './ask.service.js'

@Controller('api/ask')
export class AskController {
  constructor(private readonly asker: AskService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@Body(new ZodPipe(AskRequestSchema)) body: AskRequest) {
    return this.asker.ask(body.question)
  }
}
