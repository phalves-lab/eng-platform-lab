import { readFile } from 'node:fs/promises'

export const SYSTEM_PROMPT = Symbol('SYSTEM_PROMPT')

const PROMPT_FILE = new URL('../../prompts/chat.md', import.meta.url)

/** Reads the versioned system prompt; the path resolves the same from `src` and from `dist`. */
export const loadSystemPrompt = () => readFile(PROMPT_FILE, 'utf8')
