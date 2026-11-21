import type pg from 'pg'
import { z } from 'zod'
import { withTransaction } from './client.js'
import { toIso } from './rows.js'

const MAX_TEXT = 20_000
const DEFAULT_LIST_LIMIT = 50

const ownerSchema = z.string().trim().min(1).max(200)
const conversationIdSchema = z.uuid()

export const ChatModeSchema = z.enum(['llm', 'retrieval'])

const SourcesSchema = z.array(z.record(z.string(), z.unknown()))

export const NewChatTurnSchema = z.object({
  owner: ownerSchema,
  conversationId: conversationIdSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  question: z.string().min(1).max(MAX_TEXT),
  answer: z.object({
    content: z.string().min(1).max(MAX_TEXT),
    mode: ChatModeSchema,
    tools: z.array(z.string().min(1)),
    sources: SourcesSchema,
  }),
})
export type NewChatTurn = z.input<typeof NewChatTurnSchema>

export interface StoredConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type StoredMessage =
  | { id: number; author: 'user'; content: string; createdAt: string }
  | {
      id: number
      author: 'assistant'
      content: string
      mode: z.infer<typeof ChatModeSchema>
      tools: string[]
      sources: Record<string, unknown>[]
      createdAt: string
    }

interface ConversationRow {
  id: string
  title: string
  created_at: Date
  updated_at: Date
  message_count: number
}

interface MessageRow {
  id: string
  content: string
  mode: z.infer<typeof ChatModeSchema> | null
  tools: unknown
  sources: unknown
  created_at: Date
}

const SUMMARY = `SELECT c.id, c.title, c.created_at, c.updated_at, count(m.id)::int AS message_count
  FROM chat_conversations c LEFT JOIN chat_messages m ON m.conversation_id = c.id`

const toConversation = (row: ConversationRow): StoredConversation => ({
  id: row.id,
  title: row.title,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  messageCount: row.message_count,
})

const toMessage = (row: MessageRow): StoredMessage => {
  const base = { id: Number(row.id), content: row.content, createdAt: toIso(row.created_at) }
  if (row.mode === null) return { ...base, author: 'user' }
  return {
    ...base,
    author: 'assistant',
    mode: row.mode,
    tools: z.array(z.string()).parse(row.tools),
    sources: SourcesSchema.parse(row.sources),
  }
}

/**
 * Chat history of each person. Callers store text already masked by the personal data filter;
 * the table also rejects plain e-mail addresses and formatted CPFs as a last line of defense.
 * Every read and write is scoped by owner, so one person never reaches another one's chats.
 */
export class ConversationRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Stores one question and its answer, creating the conversation when no id is given. Returns
   * null when the conversation does not exist or belongs to someone else.
   */
  async appendTurn(input: NewChatTurn): Promise<StoredConversation | null> {
    const turn = NewChatTurnSchema.parse(input)
    return withTransaction(this.pool, async (client) => {
      const target = turn.conversationId
        ? await client.query<{ id: string }>(
            `UPDATE chat_conversations SET updated_at = now()
             WHERE id = $1 AND owner = $2 RETURNING id`,
            [turn.conversationId, turn.owner],
          )
        : await client.query<{ id: string }>(
            `INSERT INTO chat_conversations (owner, title) VALUES ($1, $2) RETURNING id`,
            [turn.owner, turn.title],
          )
      const id = target.rows[0]?.id
      if (!id) return null
      await client.query(
        `INSERT INTO chat_messages (conversation_id, author, content) VALUES ($1, 'user', $2)`,
        [id, turn.question],
      )
      await client.query(
        `INSERT INTO chat_messages (conversation_id, author, content, mode, tools, sources)
         VALUES ($1, 'assistant', $2, $3, $4, $5)`,
        [
          id,
          turn.answer.content,
          turn.answer.mode,
          JSON.stringify(turn.answer.tools),
          JSON.stringify(turn.answer.sources),
        ],
      )
      const summary = await client.query<ConversationRow>(
        `${SUMMARY} WHERE c.id = $1 GROUP BY c.id`,
        [id],
      )
      return toConversation(summary.rows[0] as ConversationRow)
    })
  }

  /** Most recently active conversations first. */
  async list(owner: string, limit = DEFAULT_LIST_LIMIT): Promise<StoredConversation[]> {
    const result = await this.pool.query<ConversationRow>(
      `${SUMMARY} WHERE c.owner = $1 GROUP BY c.id ORDER BY c.updated_at DESC, c.id LIMIT $2`,
      [ownerSchema.parse(owner), limit],
    )
    return result.rows.map(toConversation)
  }

  async find(
    owner: string,
    id: string,
  ): Promise<(StoredConversation & { messages: StoredMessage[] }) | null> {
    if (!conversationIdSchema.safeParse(id).success) return null
    const summary = await this.pool.query<ConversationRow>(
      `${SUMMARY} WHERE c.id = $1 AND c.owner = $2 GROUP BY c.id`,
      [id, ownerSchema.parse(owner)],
    )
    const row = summary.rows[0]
    if (!row) return null
    const messages = await this.pool.query<MessageRow>(
      `SELECT id, content, mode, tools, sources, created_at FROM chat_messages
       WHERE conversation_id = $1 ORDER BY id`,
      [id],
    )
    return { ...toConversation(row), messages: messages.rows.map(toMessage) }
  }

  /** Deletes one conversation of the owner with its messages; false when there was none. */
  async remove(owner: string, id: string): Promise<boolean> {
    if (!conversationIdSchema.safeParse(id).success) return false
    const result = await this.pool.query(
      'DELETE FROM chat_conversations WHERE id = $1 AND owner = $2',
      [id, ownerSchema.parse(owner)],
    )
    return (result.rowCount ?? 0) > 0
  }

  /** Retention: deletes conversations with no activity since `cutoff` and returns how many. */
  async removeInactiveSince(cutoff: string): Promise<number> {
    const result = await this.pool.query('DELETE FROM chat_conversations WHERE updated_at < $1', [
      z.iso.datetime({ offset: true }).parse(cutoff),
    ])
    return result.rowCount ?? 0
  }
}
