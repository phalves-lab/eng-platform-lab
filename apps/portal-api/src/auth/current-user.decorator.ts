import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { User } from '@lab/contracts'

export type AuthenticatedRequest = {
  user?: User
  headers: Record<string, string | string[] | undefined>
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
)
