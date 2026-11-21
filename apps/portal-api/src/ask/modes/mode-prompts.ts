import { readFile } from 'node:fs/promises'
import { DRAFT_MODE_IDS, type DraftModeId } from './mode-definitions.js'

export const MODE_PROMPTS = Symbol('MODE_PROMPTS')

export type ModePrompts = Record<DraftModeId, string>

const PROMPTS_DIR = new URL('../../../prompts/', import.meta.url)
/** Exact-case path of the template, since CI runs on a case-sensitive file system. */
export const PR_TEMPLATE = new URL(
  '../../../../../.github/PULL_REQUEST_TEMPLATE.md',
  import.meta.url,
)
const PR_TEMPLATE_SLOT = '{{pull_request_template}}'

export interface ModePromptFiles {
  promptsDir?: URL
  prTemplate?: URL
}

/**
 * Reads the shared draft rules and the versioned prompt of every draft mode, with the repository
 * PR template filled in where a prompt asks for it. Paths resolve the same from `src` and `dist`.
 */
export const loadModePrompts = async ({
  promptsDir = PROMPTS_DIR,
  prTemplate = PR_TEMPLATE,
}: ModePromptFiles = {}): Promise<ModePrompts> => {
  const rules = await readFile(new URL('draft-rules.md', promptsDir), 'utf8')
  let template: string | null = null
  const entries = await Promise.all(
    DRAFT_MODE_IDS.map(async (id) => {
      let prompt = await readFile(new URL(`modes/${id}.md`, promptsDir), 'utf8')
      if (prompt.includes(PR_TEMPLATE_SLOT)) {
        template ??= (await readFile(prTemplate, 'utf8')).trim()
        prompt = prompt.replace(PR_TEMPLATE_SLOT, template)
      }
      return [id, `${rules.trim()}\n\n${prompt.trim()}\n`] as const
    }),
  )
  return Object.fromEntries(entries) as ModePrompts
}
