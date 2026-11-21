import { Module } from '@nestjs/common'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { ConversationsModule } from '../conversations/conversations.module.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { createProjectTool } from '../projects/project-tool.js'
import { ProjectsModule } from '../projects/projects.module.js'
import { ProjectsService } from '../projects/projects.service.js'
import { AskController } from './ask.controller.js'
import { AskService } from './ask.service.js'
import { CHAT_TOOLS } from './chat-tools.js'
import { ChatService } from './chat.service.js'
import { MODEL_PROVIDER } from './model/model-provider.js'
import { OpenAICompatibleProvider } from './model/openai-compatible.provider.js'
import { SYSTEM_PROMPT, loadSystemPrompt } from './system-prompt.js'

@Module({
  imports: [HandbookModule, ConversationsModule, ProjectsModule],
  controllers: [AskController],
  providers: [
    AskService,
    ChatService,
    { provide: SYSTEM_PROMPT, useFactory: loadSystemPrompt },
    {
      provide: CHAT_TOOLS,
      inject: [ProjectsService],
      useFactory: (projects: ProjectsService) => [createProjectTool(projects)],
    },
    {
      provide: MODEL_PROVIDER,
      inject: [CONFIG],
      useFactory: (config: PortalConfig) =>
        config.llm
          ? new OpenAICompatibleProvider({
              baseUrl: config.llm.baseUrl,
              apiKey: config.llm.apiKey,
              model: config.llm.model,
            })
          : null,
    },
  ],
})
export class AskModule {}
