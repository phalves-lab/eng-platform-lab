import { Controller, ForbiddenException, Get, Query } from '@nestjs/common'
import {
  type MyWorkQuery,
  MyWorkQuerySchema,
  type MyWorkResponse,
  type TeamWorkQuery,
  TeamWorkQuerySchema,
  type TeamWorkResponse,
  type User,
} from '@lab/contracts'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { WorkService } from './work.service.js'

export const TEAM_ROLE_MESSAGE = 'Only leads and admins see the team view'

@Controller('api')
export class WorkController {
  constructor(private readonly work: WorkService) {}

  @Get('me/work')
  myWork(
    @CurrentUser() user: User,
    @Query(new ZodPipe(MyWorkQuerySchema)) query: MyWorkQuery,
  ): Promise<MyWorkResponse> {
    return this.work.myWork(user, query)
  }

  /** Load per person for leads and admins, in alphabetical order and without any score. */
  @Get('team/work')
  teamWork(
    @CurrentUser() user: User,
    @Query(new ZodPipe(TeamWorkQuerySchema)) query: TeamWorkQuery,
  ): Promise<TeamWorkResponse> {
    if (user.role !== 'lead' && user.role !== 'admin') {
      throw new ForbiddenException(TEAM_ROLE_MESSAGE)
    }
    return this.work.teamWork(user, query)
  }
}
