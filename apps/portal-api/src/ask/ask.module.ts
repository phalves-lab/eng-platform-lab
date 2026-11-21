import { HttpException, Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module.js'
import { CatalogService } from '../catalog/catalog.service.js'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { ConversationsModule } from '../conversations/conversations.module.js'
import { DoraModule } from '../dora/dora.module.js'
import { DoraService } from '../dora/dora.service.js'
import { FlowModule } from '../flow/flow.module.js'
import { FlowService } from '../flow/flow.service.js'
import { HandbookModule } from '../handbook/handbook.module.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { createProjectTool } from '../projects/project-tool.js'
import { ProjectsModule } from '../projects/projects.module.js'
import { ProjectsService } from '../projects/projects.service.js'
import { ReviewModule } from '../review/review.module.js'
import { ReviewService } from '../review/review.service.js'
import { AskController } from './ask.controller.js'
import { AskService } from './ask.service.js'
import { ChatService } from './chat.service.js'
import { ChatModesController } from './modes/chat-modes.controller.js'
import { CHAT_MODES, DraftModes } from './modes/draft-modes.js'
import { MODE_PROMPTS, type ModePrompts, loadModePrompts } from './modes/mode-prompts.js'
import { skillLookup } from './modes/skill-lookup.js'
import { MODEL_PROVIDER } from './model/model-provider.js'
import { OpenAICompatibleProvider } from './model/openai-compatible.provider.js'
import { SYSTEM_PROMPT, loadSystemPrompt } from './system-prompt.js'
import { CHAT_TOOLS, handbookChatTools } from './tools/chat-tool.js'
import { createPortalTools } from './tools/portal-tools.js'
import { TaskFixtures } from './tools/task-fixtures.js'

const skillsInCatalog = (catalog: CatalogService) =>
  skillLookup((plugin) => {
    try {
      return catalog.plugin(plugin).skills
    } catch (error) {
      if (error instanceof HttpException) return null
      throw error
    }
  })

@Module({
  imports: [
    HandbookModule,
    ConversationsModule,
    ReviewModule,
    FlowModule,
    DoraModule,
    CatalogModule,
    ProjectsModule,
  ],
  controllers: [AskController, ChatModesController],
  providers: [
    AskService,
    ChatService,
    { provide: SYSTEM_PROMPT, useFactory: loadSystemPrompt },
    { provide: MODE_PROMPTS, useFactory: () => loadModePrompts() },
    {
      provide: CHAT_MODES,
      inject: [
        MODE_PROMPTS,
        CONFIG,
        HandbookService,
        ReviewService,
        FlowService,
        DoraService,
        CatalogService,
      ],
      useFactory: (
        prompts: ModePrompts,
        config: PortalConfig,
        handbook: HandbookService,
        review: ReviewService,
        flow: FlowService,
        dora: DoraService,
        catalog: CatalogService,
      ) => {
        const tasks = new TaskFixtures(config.tasksDir)
        return new DraftModes({
          prompts,
          handbookTools: handbookChatTools(() => handbook.snapshot()),
          portalTools: createPortalTools({
            review: async (dataset) => {
              const { title, generatedAt, metrics, trend, alerts } = await review.dataset(dataset)
              return { title, generatedAt, metrics, trend, alerts }
            },
            flow: (query) => flow.flow(query),
            dora: (query) => dora.metrics(query),
            task: (key) => tasks.find(key),
          }),
          skill: skillsInCatalog(catalog),
        })
      },
    },
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
