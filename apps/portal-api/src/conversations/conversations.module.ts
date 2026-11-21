import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { CONVERSATION_BACKEND, createConversationBackend } from './conversation-backend.js'
import { ConversationsController } from './conversations.controller.js'
import { ConversationsService } from './conversations.service.js'

@Module({
  controllers: [ConversationsController],
  providers: [
    {
      provide: CONVERSATION_BACKEND,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) => createConversationBackend(config.panelSource),
    },
    ConversationsService,
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}
