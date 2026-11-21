import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common'
import type { User } from '@lab/contracts'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ConversationsService } from './conversations.service.js'

const ownerOf = (user: User | undefined) => {
  if (!user) throw new UnauthorizedException('Missing user')
  return user.login
}

/** Each person lists, opens and deletes only their own conversations. */
@Controller('api/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: User | undefined) {
    return this.conversations.list(ownerOf(user))
  }

  @Get(':id')
  get(@CurrentUser() user: User | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.get(ownerOf(user), id)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: User | undefined, @Param('id', ParseUUIDPipe) id: string) {
    await this.conversations.remove(ownerOf(user), id)
  }
}
