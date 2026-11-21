import { Controller, ForbiddenException, Get, Query } from '@nestjs/common'
import { type AuditQuery, AuditQuerySchema, type User } from '@lab/contracts'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { AuditService } from './audit.service.js'

/** The audit trail is visible only to admins; every read of it is itself recorded. */
@Controller('api/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: User | undefined,
    @Query(new ZodPipe(AuditQuerySchema)) query: AuditQuery,
  ) {
    if (user?.role !== 'admin') throw new ForbiddenException('Only admins can read the audit trail')
    return this.audit.list(query)
  }
}
