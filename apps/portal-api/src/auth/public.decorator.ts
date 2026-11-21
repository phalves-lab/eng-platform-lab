import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'portal:isPublic'

/** Marks a route as reachable without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true)
