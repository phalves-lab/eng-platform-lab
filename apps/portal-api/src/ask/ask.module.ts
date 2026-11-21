import { Module } from '@nestjs/common'
import { AI_PRICING, AI_USAGE_SINK } from '../ai-usage/usage-sink.js'
import { CONFIG } from '../config/config.js'
import { ConversationsModule } from '../conversations/conversations.module.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { AskController } from './ask.controller.js'
import { AskService } from './ask.service.js'
import { ChatService } from './chat.service.js'
import { MODEL_PROVIDER } from './model/model-provider.js'
import { createModelProvider } from './model/recording-provider.js'
import { SYSTEM_PROMPT, loadSystemPrompt } from './system-prompt.js'

@Module({
  imports: [HandbookModule, ConversationsModule],
  controllers: [AskController],
  providers: [
    AskService,
    ChatService,
    { provide: SYSTEM_PROMPT, useFactory: loadSystemPrompt },
    {
      provide: MODEL_PROVIDER,
      inject: [CONFIG, AI_PRICING, AI_USAGE_SINK],
      useFactory: createModelProvider,
    },
  ],
})
export class AskModule {}
