import { Controller, Get, Inject } from '@nestjs/common'
import type { ChatModesResponse } from '@lab/contracts'
import { CONFIG, type PortalConfig } from '../../config/config.js'
import { CHAT_MODES, type DraftModes } from './draft-modes.js'

@Controller('api/ask/modes')
export class ChatModesController {
  constructor(
    @Inject(CHAT_MODES) private readonly modes: DraftModes,
    @Inject(CONFIG) private readonly config: PortalConfig,
  ) {}

  @Get()
  list(): ChatModesResponse {
    return { modes: this.modes.list(this.config.llm !== null) }
  }
}
