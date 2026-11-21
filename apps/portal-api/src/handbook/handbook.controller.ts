import { Controller, Get, Param, Query } from '@nestjs/common'
import { type StandardFilter, StandardFilterSchema } from '@lab/contracts'
import { z } from 'zod'
import { ZodPipe } from '../common/zod.pipe.js'
import { HandbookService } from './handbook.service.js'

const TermSchema = z.object({ term: z.string().trim().min(1).optional() })
const PrioritySchema = z.object({ priority: z.coerce.number().int().min(1).max(3).optional() })
const SearchSchema = z.object({
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(20).optional(),
})

@Controller('api/handbook')
export class HandbookController {
  constructor(private readonly handbook: HandbookService) {}

  @Get('overview')
  overview() {
    return this.handbook.overview()
  }

  @Get('rules')
  rules() {
    return { rules: this.handbook.rulesForAi() }
  }

  @Get('standards')
  standards(@Query(new ZodPipe(StandardFilterSchema)) filter: StandardFilter) {
    return this.handbook.standards(filter)
  }

  @Get('standards/:id')
  standard(@Param('id') id: string) {
    return this.handbook.standard(id)
  }

  @Get('systems')
  systems(@Query(new ZodPipe(TermSchema)) query: z.infer<typeof TermSchema>) {
    return this.handbook.systems(query.term)
  }

  @Get('systems/:slug')
  system(@Param('slug') slug: string) {
    return this.handbook.system(slug)
  }

  @Get('glossary')
  glossary(@Query(new ZodPipe(TermSchema)) query: z.infer<typeof TermSchema>) {
    return this.handbook.glossary(query.term)
  }

  @Get('decisions')
  decisions(@Query(new ZodPipe(PrioritySchema)) query: z.infer<typeof PrioritySchema>) {
    return this.handbook.decisions(query.priority)
  }

  @Get('search')
  search(@Query(new ZodPipe(SearchSchema)) query: z.infer<typeof SearchSchema>) {
    return this.handbook.search(query.q, query.limit)
  }
}
