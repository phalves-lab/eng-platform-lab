import { Controller, Get, Param, Query } from '@nestjs/common'
import type { User } from '@lab/contracts'
import { z } from 'zod'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { ZodPipe } from '../common/zod.pipe.js'
import { ReviewService } from './review.service.js'

const DatasetQuerySchema = z.object({
  dataset: z.string().trim().min(1).default('lab'),
  login: z.string().trim().min(1).optional(),
})

@Controller('api')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('review/datasets')
  datasets() {
    return this.review.datasets()
  }

  @Get('review/datasets/:id')
  dataset(@Param('id') id: string) {
    return this.review.dataset(id)
  }

  /** Leads may look at another person's queue to balance load; everyone else sees their own. */
  @Get('me/review')
  myReview(
    @CurrentUser() user: User,
    @Query(new ZodPipe(DatasetQuerySchema)) query: z.infer<typeof DatasetQuerySchema>,
  ) {
    const canSeeOthers = user.role === 'lead' || user.role === 'admin'
    const login = canSeeOthers && query.login ? query.login : user.login
    return this.review.myQueue(query.dataset, login)
  }
}
