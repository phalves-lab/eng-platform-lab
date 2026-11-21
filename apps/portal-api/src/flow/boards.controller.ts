import { Controller, Get, Param } from '@nestjs/common'
import { BoardProjectParamSchema, type BoardResponse, type BoardSummary } from '@lab/contracts'
import { ZodPipe } from '../common/zod.pipe.js'
import { FlowService } from './flow.service.js'

/** Read-only boards per Jira project; nothing here writes to Jira. */
@Controller('api/boards')
export class BoardsController {
  constructor(private readonly flow: FlowService) {}

  @Get()
  list(): Promise<BoardSummary[]> {
    return this.flow.boards()
  }

  @Get(':project')
  board(
    @Param('project', new ZodPipe(BoardProjectParamSchema)) project: string,
  ): Promise<BoardResponse> {
    return this.flow.board(project)
  }
}
