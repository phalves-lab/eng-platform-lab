import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/** Validates and narrows request input with a Zod schema, answering 400 on failure. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message))
    }
    return result.data
  }
}
