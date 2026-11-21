import type { ChatModeSkill } from '@lab/contracts'
import type { SkillRef } from './mode-definitions.js'

interface SkillEntry {
  name: string
  description: string
}

/**
 * Resolves a mode's skill against the catalog: `skillsOf` returns the skills of a plugin, or
 * null when the plugin or the whole catalog is missing, and the mode then runs on its own prompt.
 */
export const skillLookup =
  (skillsOf: (plugin: string) => readonly SkillEntry[] | null) =>
  (ref: SkillRef): ChatModeSkill => {
    const skill = skillsOf(ref.plugin)?.find((entry) => entry.name === ref.skill)
    return { ...ref, description: skill?.description ?? null, found: Boolean(skill) }
  }
