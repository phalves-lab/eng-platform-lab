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
  type ChatRequest,
  ChatRequestSchema,
  type ChatStreamEvent,
  type User,
  encodeSseEvent,
} from '@lab/contracts'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ConversationsService } from '../conversations/conversations.service.js'
import { ChatService, type Emit } from './chat.service.js'

const ASK_LIMIT = { default: { limit: 20, ttl: 60_000 } }

@Controller('api/ask')
export class AskController {
  private readonly logger = new Logger(AskController.name)

  constructor(
    private readonly chat: ChatService,
    private readonly conversations: ConversationsService,
  ) {}

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

  /**
   * Streams the answer as server-sent events and stops the model when the client disconnects.
   * With `conversationId` the earlier turns go along as context; a finished answer is stored in
   * the person's history and announced with a `conversation` event after `done`.
   */
  @Post('stream')
  @Throttle(ASK_LIMIT)
  async stream(
    @Body(new ZodPipe(ChatRequestSchema)) body: ChatRequest,
    @CurrentUser() user: User | undefined,
    @Res() res: Response,
  ) {
    const owner = user?.login ?? null
    const history = owner ? await this.conversations.history(owner, body.conversationId) : []
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
    const send = (event: ChatStreamEvent) => {
      if (!res.writableEnded) res.write(encodeSseEvent(event))
    }
    const tools: string[] = []
    const relay: Emit = (event) => {
      if (event.type === 'tool') tools.push(event.name)
      send(event)
    }
    try {
      const response = await this.chat.answer(body.question, relay, client.signal, history)
      if (response && owner && !client.signal.aborted) {
        const conversation = await this.conversations.record({
          owner,
          conversationId: body.conversationId ?? null,
          question: body.question,
          response,
          tools,
        })
        if (conversation) send({ type: 'conversation', conversation })
      }
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
