import { type Conversation, ConversationIdSchema, type ConversationSummary } from '@lab/contracts'
import { newTurn, type Turn } from './ask-stream'

export const CONVERSATION_PARAM = 'conversa'

const UNSAVED_ANSWER = 'A resposta desta pergunta não ficou guardada.'

export const conversationHref = (id: string | null) =>
  id ? `/pergunte?${CONVERSATION_PARAM}=${encodeURIComponent(id)}` : '/pergunte'

/** Conversation id from the query string, or null when it is missing or malformed. */
export const parseConversationId = (value: string | string[] | undefined): string | null => {
  const parsed = ConversationIdSchema.safeParse(Array.isArray(value) ? value[0] : value)
  return parsed.success ? parsed.data : null
}

/** Rebuilds the chat turns of a stored conversation, pairing each question with its answer. */
export const turnsFromConversation = (conversation: Conversation): Turn[] => {
  const turns: Turn[] = []
  for (const message of conversation.messages) {
    if (message.author === 'user') {
      turns.push({
        ...newTurn(turns.length, message.content),
        status: 'error',
        error: UNSAVED_ANSWER,
      })
      continue
    }
    const last = turns.at(-1)
    if (!last || last.response) continue
    turns[turns.length - 1] = {
      ...last,
      mode: message.response.mode,
      text: message.response.answer,
      tools: message.tools,
      response: message.response,
      error: null,
      status: 'done',
    }
  }
  return turns
}

/** Puts the saved conversation at the top of the list, replacing its older entry. */
export const upsertConversation = (
  list: ConversationSummary[],
  saved: ConversationSummary,
): ConversationSummary[] => [saved, ...list.filter((item) => item.id !== saved.id)]

export const questionCount = (conversation: ConversationSummary) => {
  const questions = Math.ceil(conversation.messageCount / 2)
  return `${questions} ${questions === 1 ? 'pergunta' : 'perguntas'}`
}
