import { Controller, Get } from '@nestjs/common'
import type { User } from '@lab/contracts'
import { CurrentUser } from './current-user.decorator.js'

@Controller('api/me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User) {
    return user
  }
}
