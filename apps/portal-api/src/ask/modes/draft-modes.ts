import type { ChatMode, ChatModeSkill } from '@lab/contracts'
import type { ChatTool } from '../tools/chat-tool.js'
import type { PortalToolName } from '../tools/portal-tools.js'
import {
  type DraftModeId,
  MODE_DEFINITIONS,
  type ModeDefinition,
  type SkillRef,
  modeDefinition,
} from './mode-definitions.js'
import type { ModePrompts } from './mode-prompts.js'

export const CHAT_MODES = Symbol('CHAT_MODES')

export interface ModeSetup {
  systemPrompt: string
  tools: readonly ChatTool[]
}

/** Prompt and tools of each draft mode, for the chat to run a turn in that mode. */
export interface ChatModes {
  setup: (mode: DraftModeId) => ModeSetup
}

export interface DraftModesOptions {
  prompts: ModePrompts
  handbookTools: readonly ChatTool[]
  portalTools: Record<PortalToolName, ChatTool>
  /** Looks the skill up in the AI catalog at call time, since the catalog loads after boot. */
  skill: (ref: SkillRef) => ChatModeSkill
}

const skillSection = (skill: ChatModeSkill) =>
  `\n## Skill de referência\n\nEste modo faz o papel da skill \`${skill.skill}\` do plugin \`${skill.plugin}\` do marketplace do time: ${skill.description ?? ''}\n`

/** Draft modes built from the versioned prompts, the marketplace skills and the read-only tools. */
export class DraftModes implements ChatModes {
  constructor(private readonly options: DraftModesOptions) {}

  setup(mode: DraftModeId): ModeSetup {
    const definition = modeDefinition(mode)
    const skill = definition.skill ? this.options.skill(definition.skill) : null
    const prompt = this.options.prompts[mode]
    return {
      systemPrompt: skill?.found ? `${prompt}${skillSection(skill)}` : prompt,
      tools: this.toolsOf(definition),
    }
  }

  /** Every mode as the chat screen shows it; draft modes need the model to be on. */
  list(modelOn: boolean): ChatMode[] {
    return MODE_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      description: definition.description,
      placeholder: definition.placeholder,
      examples: definition.examples,
      draft: definition.id !== 'ask',
      maxLength: definition.maxLength,
      available: definition.id === 'ask' || modelOn,
      skill: definition.skill ? this.options.skill(definition.skill) : null,
    }))
  }

  private toolsOf(definition: ModeDefinition): ChatTool[] {
    return [
      ...(definition.handbookTools ? this.options.handbookTools : []),
      ...definition.portalTools.map((name) => this.options.portalTools[name]),
    ]
  }
}
