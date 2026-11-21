import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common'
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js'
import type { AuditOutcome, User } from '@lab/contracts'
import { Reflector } from '@nestjs/core'
import { Observable, catchError, concatMap, from, map, throwError } from 'rxjs'
import { withAuditScope } from './audit-context.js'
import { AUDIT_STORE, type AuditStore } from './audit-store.js'
import { type AuditPlan, classifyRequest } from './classify.js'
import { truncateIp } from './ip.js'

interface HttpRequest {
  method: string
  path: string
  ip?: string
  route?: { path?: unknown }
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: unknown
  user?: User
}

interface HttpResponse {
  statusCode: number
  headersSent: boolean
}

const outcomeOf = (status: number): AuditOutcome => {
  if (status === 401 || status === 403) return 'denied'
  return status < 400 ? 'success' : 'failed'
}

/**
 * Global interceptor that writes the audit trail for every route, so no controller has to
 * remember it. It runs after the auth guard, records once the handler finished (or failed) and
 * never changes the response: a failure to record is logged, not returned.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUDIT_STORE) private readonly store: AuditStore | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.store) return next.handle()
    const http = context.switchToHttp()
    const request = http.getRequest<HttpRequest>()
    const user = request.user
    if (!user) return next.handle()
    const plan = classifyRequest({
      method: request.method,
      route: typeof request.route?.path === 'string' ? request.route.path : request.path,
      params: request.params ?? {},
      query: request.query ?? {},
      body: request.body,
      login: user.login,
    })
    if (!plan) return next.handle()

    const declared = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    )
    const response = http.getResponse<HttpResponse>()
    const successStatus = () =>
      declared ??
      (response.headersSent ? response.statusCode : request.method === 'POST' ? 201 : 200)

    const statusOf = (error: unknown) => (error instanceof HttpException ? error.getStatus() : 500)

    return new Observable((subscriber) =>
      withAuditScope((scope) => {
        const write = (status: number) =>
          from(this.record(user, plan, status, request.ip, scope.releaseRunId))
        return next
          .handle()
          .pipe(
            concatMap((value) => write(successStatus()).pipe(map(() => value))),
            catchError((error: unknown) =>
              write(statusOf(error)).pipe(concatMap(() => throwError(() => error))),
            ),
          )
          .subscribe(subscriber)
      }),
    )
  }

  private async record(
    user: User,
    plan: AuditPlan,
    status: number,
    ip: string | undefined,
    releaseRunId: number | null,
  ) {
    try {
      await this.store?.record({
        actor: user.login,
        role: user.role,
        action: plan.action,
        kind: plan.kind,
        target: plan.target,
        outcome: outcomeOf(status),
        status,
        ipPrefix: truncateIp(ip),
        releaseRunId,
      })
    } catch (error) {
      this.logger.error(
        `audit event not recorded for ${plan.action}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
