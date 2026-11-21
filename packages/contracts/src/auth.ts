import { z } from 'zod'

export const PortalRoleSchema = z.enum(['dev', 'lead', 'admin'])
export type PortalRole = z.infer<typeof PortalRoleSchema>

const ROLE_RANK: Record<PortalRole, number> = { dev: 1, lead: 2, admin: 3 }

export const RoleGroupSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  role: PortalRoleSchema,
})
export type RoleGroup = z.infer<typeof RoleGroupSchema>

/**
 * Versioned map from Entra ID group object ids to portal roles. `defaultRole: null` denies
 * access to anyone signed in without a mapped group.
 */
export const RoleMapSchema = z
  .object({
    defaultRole: PortalRoleSchema.nullable(),
    groups: z.array(RoleGroupSchema),
  })
  .superRefine((map, ctx) => {
    const seen = new Set<string>()
    for (const group of map.groups) {
      const id = group.id.toLowerCase()
      if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `duplicated group ${group.id}` })
      seen.add(id)
    }
  })
export type RoleMap = z.infer<typeof RoleMapSchema>

/** Highest role among the given ones, or null when the list is empty. */
export const highestRole = (roles: readonly PortalRole[]): PortalRole | null =>
  roles.reduce<PortalRole | null>(
    (best, role) => (best === null || ROLE_RANK[role] > ROLE_RANK[best] ? role : best),
    null,
  )

/** Role granted by the groups in a token: the highest mapped one, else the default role. */
export const roleFromGroups = (map: RoleMap, groups: readonly string[]): PortalRole | null => {
  const ids = new Set(groups.map((group) => group.toLowerCase()))
  const mapped = map.groups.filter((group) => ids.has(group.id.toLowerCase()))
  return highestRole(mapped.map((group) => group.role)) ?? map.defaultRole
}
