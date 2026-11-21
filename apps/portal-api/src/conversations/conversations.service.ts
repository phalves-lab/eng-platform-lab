import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  type AskResponse,
  AskResponseSchema,
  type ChatModeId,
  ChatModeIdSchema,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
} from '@lab/contracts'
import type { StoredConversation, StoredMessage } from '@lab/database'
import type { PastTurn } from '../ask/chat.service.js'
import { maskPersonalData } from '../ask/model/personal-data.js'
import { CONVERSATION_BACKEND, type ConversationBackend } from './conversation-backend.js'

const UNDEFINED_TABLE = '42P01'
const MAX_TITLE = 80
const MAX_TEXT = 20_000

export interface TurnToRecord {
  owner: string
  conversationId: string | null
  question: string
  response: AskResponse
  tools: string[]
  chatMode: ChatModeId
}

/** What a new turn needs from the conversation it continues. */
export interface Continuation {
  chatMode: ChatModeId
  turns: PastTurn[]
}

const unavailable = () => new ServiceUnavailableException('Chat history is not available')

const notFound = () => new NotFoundException('Conversation not found')

const isUndefinedTable = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE

const titleOf = (question: string) => {
  const line = question.replace(/\s+/g, ' ').trim()
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trimEnd()}…` : line
}

/** A mode this version does not know, written by a newer one, reads as the ask mode. */
const toSummary = (stored: StoredConversation): ConversationSummary => ({
  ...stored,
  chatMode: ChatModeIdSchema.catch('ask').parse(stored.chatMode),
})

const toMessage = (message: StoredMessage): ConversationMessage => {
  if (message.author === 'user') {
    return { author: 'user', content: message.content, createdAt: message.createdAt }
  }
  const response =
    message.mode === 'llm'
      ? { mode: message.mode, answer: message.content, citations: message.sources }
      : { mode: message.mode, answer: message.content, sources: message.sources }
  return {
    author: 'assistant',
    tools: message.tools,
    response: AskResponseSchema.parse(response),
    createdAt: message.createdAt,
  }
}

/** Pairs each stored question with the answer right after it. */
const toPastTurns = (messages: ConversationMessage[]): PastTurn[] =>
  messages.flatMap((message, index) => {
    const next = messages[index + 1]
    if (message.author !== 'user' || next?.author !== 'assistant') return []
    return [{ question: message.content, answer: next.response.answer }]
  })

/**
 * Keeps the chat history of each person. Question, answer and title are masked by the personal
 * data filter before they are stored; a failure to store never breaks the answer itself.
 */
@Injectable()
export class ConversationsService implements OnModuleDestroy {
  private readonly logger = new Logger(ConversationsService.name)

  constructor(@Inject(CONVERSATION_BACKEND) private readonly backend: ConversationBackend | null) {}

  async onModuleDestroy(): Promise<void> {
    await this.backend?.close()
  }

  private async run<T>(work: (backend: ConversationBackend) => Promise<T>): Promise<T> {
    if (!this.backend) throw unavailable()
    try {
      return await work(this.backend)
    } catch (error) {
      if (isUndefinedTable(error)) throw unavailable()
      throw error
    }
  }

  list(owner: string): Promise<ConversationSummary[]> {
    return this.run(async (backend) => (await backend.store.list(owner)).map(toSummary))
  }

  async get(owner: string, id: string): Promise<Conversation> {
    const found = await this.run((backend) => backend.store.find(owner, id))
    if (!found) throw notFound()
    return { ...toSummary(found), messages: found.messages.map(toMessage) }
  }

  async remove(owner: string, id: string): Promise<void> {
    if (!(await this.run((backend) => backend.store.remove(owner, id)))) throw notFound()
  }

  /**
   * Mode and earlier turns of the conversation being continued. A new conversation, or one
   * without a history store, keeps the requested mode and starts with no turns.
   */
  async continuation(
    owner: string,
    id: string | undefined,
    requested: ChatModeId,
  ): Promise<Continuation> {
    if (!id || !this.backend) return { chatMode: requested, turns: [] }
    const conversation = await this.get(owner, id)
    return { chatMode: conversation.chatMode, turns: toPastTurns(conversation.messages) }
  }

  async record(turn: TurnToRecord): Promise<ConversationSummary | null> {
    if (!this.backend) return null
    const question = maskPersonalData(turn.question)
    const { response } = turn
    try {
      const stored = await this.backend.store.appendTurn({
        owner: turn.owner,
        conversationId: turn.conversationId,
        title: titleOf(question),
        chatMode: turn.chatMode,
        question,
        answer: {
          content: maskPersonalData(response.answer).slice(0, MAX_TEXT),
          mode: response.mode,
          tools: [...new Set(turn.tools)],
          sources: response.mode === 'llm' ? response.citations : response.sources,
        },
      })
      return stored ? toSummary(stored) : null
    } catch (error) {
      this.logger.error(
        `could not store the chat turn: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }
}
