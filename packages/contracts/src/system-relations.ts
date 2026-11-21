import { z } from 'zod'

/** Module as declared in `catalog/modules/*.yaml`; other keys of the file are ignored. */
export const CatalogModuleSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  tier: z.string().trim().min(1),
  paths: z.array(z.string().trim().min(1)).default([]),
})
export type CatalogModule = z.infer<typeof CatalogModuleSchema>

/** System on the other side of an event; `slug` is null when no handbook card has that name. */
export const SystemPeerSchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
})
export type SystemPeer = z.infer<typeof SystemPeerSchema>

export const SystemEventSchema = z.object({
  topic: z.string(),
  event: z.string(),
  payload: z.string(),
  source: z.string(),
  peers: z.array(SystemPeerSchema),
})
export type SystemEvent = z.infer<typeof SystemEventSchema>

/**
 * What a system card links to: owner, events it produces (peers are the consumers), events it
 * consumes (peer is the producer) and the module cited in its sources. `moduleId` is set even
 * when the catalog has no such module, so the page can flag the broken link.
 */
export const SystemRelationsSchema = z.object({
  slug: z.string(),
  owner: z.string().nullable(),
  produces: z.array(SystemEventSchema),
  consumes: z.array(SystemEventSchema),
  moduleId: z.string().nullable(),
  module: CatalogModuleSchema.nullable(),
})
export type SystemRelations = z.infer<typeof SystemRelationsSchema>
