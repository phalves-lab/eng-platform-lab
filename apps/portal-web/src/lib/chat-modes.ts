import {
  ASK_MAX_LENGTH,
  type ChatMode,
  type ChatModeId,
  type ModeChatRequestInput,
} from '@lab/contracts'
import type { Turn } from './ask-stream'

/** The ask mode as the screen shows it when portal-api cannot list the modes. */
export const ASK_MODE: ChatMode = {
  id: 'ask',
  label: 'Perguntar',
  description:
    'Dúvidas sobre padrões, sistemas, siglas e decisões do handbook, sempre com a fonte.',
  placeholder: 'Pergunte algo, por exemplo: quem é dono do bot de review?',
  examples: [
    'Qual o padrão de nome de branch?',
    'O que diz o ENG-QA-01?',
    'Quantas aprovações um PR precisa?',
    'Como o bot de review funciona?',
  ],
  draft: false,
  maxLength: ASK_MAX_LENGTH,
  available: true,
  skill: null,
}

export const DRAFT_NOTICE =
  'Rascunho: nada foi gravado no Jira, no GitHub ou no handbook. Revise antes de copiar.'

/** The listed mode, falling back to the ask mode for an id the list does not have. */
export const findMode = (modes: readonly ChatMode[], id: ChatModeId): ChatMode =>
  modes.find((mode) => mode.id === id) ?? modes.find((mode) => mode.id === 'ask') ?? ASK_MODE

/** Modes the person can pick; the ask mode is always there even if the list came without it. */
export const selectableModes = (modes: readonly ChatMode[]): ChatMode[] =>
  modes.some((mode) => mode.id === 'ask') ? [...modes] : [ASK_MODE, ...modes]

export const chatRequestBody = (
  question: string,
  mode: ChatModeId,
  conversationId: string | null,
): ModeChatRequestInput => ({
  question,
  mode,
  ...(conversationId ? { conversationId } : {}),
})

/** A finished draft written by the model, the only kind of answer the screen offers to copy. */
export const copyableDraft = (turn: Turn): string | null =>
  turn.status === 'done' && turn.response?.mode === 'llm' && turn.text.trim()
    ? turn.text.trim()
    : null
