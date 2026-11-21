import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type AskRequest,
  AskRequestSchema,
  type AskStreamEvent,
  encodeSseEvent,
} from '@lab/contracts'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { ZodPipe } from '../common/zod.pipe.js'
import { ChatService } from './chat.service.js'

const ASK_LIMIT = { default: { limit: 20, ttl: 60_000 } }

@Controller('api/ask')
export class AskController {
  private readonly logger = new Logger(AskController.name)

  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(200)
  @Throttle(ASK_LIMIT)
  async ask(@Body(new ZodPipe(AskRequestSchema)) body: AskRequest) {
    const response = await this.chat.answer(
      body.question,
      () => undefined,
      new AbortController().signal,
    )
    if (!response) throw new ServiceUnavailableException('The model stopped before answering')
    return response
  }

  /** Streams the answer as server-sent events and stops the model when the client disconnects. */
  @Post('stream')
  @Throttle(ASK_LIMIT)
  async stream(@Body(new ZodPipe(AskRequestSchema)) body: AskRequest, @Res() res: Response) {
    const client = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) client.abort()
    })
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    const send = (event: AskStreamEvent) => {
      if (!res.writableEnded) res.write(encodeSseEvent(event))
    }
    try {
      await this.chat.answer(body.question, send, client.signal)
    } catch (error) {
      if (client.signal.aborted) {
        this.logger.log('client cancelled the answer')
      } else {
        this.logger.error(error instanceof Error ? error.message : String(error))
        send({ type: 'error', message: 'Não foi possível responder agora. Tente de novo.' })
      }
    } finally {
      res.end()
    }
  }
}
