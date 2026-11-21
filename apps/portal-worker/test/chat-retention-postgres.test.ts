import { ConversationRepository } from '@lab/database'
import { type IsolatedSchema, createIsolatedSchema } from '@lab/database/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createChatRetentionCollector } from '../src/collectors/chat-retention.js'
import { createLogger } from '../src/logger.js'
import { Scheduler } from '../src/scheduler.js'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('chat retention on Postgres', () => {
  let db: IsolatedSchema

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('keeps conversations active inside the window and deletes the idle ones', async () => {
    const conversations = new ConversationRepository(db.pool)
    const answer = { content: 'Resposta.', mode: 'llm' as const, tools: [], sources: [] }
    const base = { owner: 'ana', conversationId: null, question: 'Pergunta?', answer }
    const idle = await conversations.appendTurn({ ...base, title: 'parada' })
    const active = await conversations.appendTurn({ ...base, title: 'ativa' })
    await db.pool.query(
      `UPDATE chat_conversations SET created_at = $2, updated_at = $2 WHERE id = $1`,
      [idle?.id, '2026-08-01T12:00:00.000Z'],
    )
    await db.pool.query(
      `UPDATE chat_conversations SET created_at = $2, updated_at = $2 WHERE id = $1`,
      [active?.id, '2026-11-01T12:00:00.000Z'],
    )

    const scheduler = new Scheduler({
      logger: createLogger(() => undefined),
      collectors: [
        createChatRetentionCollector({ conversations, retentionDays: 90, intervalMs: 60_000 }),
      ],
      clock: () => new Date('2026-11-21T12:00:00.000Z'),
    })
    expect(await scheduler.runAll()).toEqual([
      { collector: 'chat-retention', status: 'ok', durationMs: 0 },
    ])
    expect((await conversations.list('ana')).map((c) => c.title)).toEqual(['ativa'])
    const messages = await db.pool.query<{ n: string }>('SELECT count(*) AS n FROM chat_messages')
    expect(messages.rows[0]?.n).toBe('2')
  })
})
