import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CONFIG, type PortalConfig } from '../config/config.js'
import type { AuthenticatedRequest } from './current-user.decorator.js'
import { IS_PUBLIC } from './public.decorator.js'
import { AccessDeniedError, TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js'

/** Global guard: every route needs a user unless marked with `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONFIG) private readonly config: PortalConfig,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (this.config.auth.mode === 'dev') {
      const login = this.config.auth.devUser
      request.user = {
        login,
        name: login,
        role: this.config.auth.devRole ?? (this.config.leadLogins.includes(login) ? 'lead' : 'dev'),
      }
      return true
    }

    const header = request.headers['authorization']
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new UnauthorizedException('Missing bearer token')
    try {
      request.user = await this.verifier.verify(token)
      return true
    } catch (error) {
      if (error instanceof AccessDeniedError) throw new ForbiddenException(error.message)
      throw new UnauthorizedException('Invalid token')
    }
  }
}
