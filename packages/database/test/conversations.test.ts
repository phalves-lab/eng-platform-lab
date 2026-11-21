import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConversationRepository, type NewChatTurn } from '../src/index.js'
import { type IsolatedSchema, createIsolatedSchema } from '../src/testing.js'

const databaseUrl = process.env.DATABASE_URL

const turn = (overrides: Partial<NewChatTurn> = {}): NewChatTurn => ({
  owner: 'ana',
  conversationId: null,
  title: 'Qual o padrão de branch?',
  question: 'Qual o padrão de branch?',
  answer: {
    content: 'Use <tipo>/LAB-<n>-slug (ENG-GIT-02).',
    mode: 'llm',
    tools: ['padrao'],
    sources: [{ kind: 'standard', ref: 'ENG-GIT-02', label: 'ENG-GIT-02', source: 'a' }],
  },
  ...overrides,
})

describe.skipIf(!databaseUrl)('ConversationRepository on Postgres', () => {
  let db: IsolatedSchema
  let repository: ConversationRepository

  beforeAll(async () => {
    db = await createIsolatedSchema(databaseUrl as string)
    repository = new ConversationRepository(db.pool)
  })

  afterAll(async () => {
    await db.drop()
  })

  it('creates a conversation, appends turns and reads them back in order', async () => {
    const created = await repository.appendTurn(turn())
    expect(created).toMatchObject({ title: 'Qual o padrão de branch?', messageCount: 2 })
    const id = created?.id as string

    const next = await repository.appendTurn(
      turn({
        conversationId: id,
        title: 'ignorado',
        question: 'E o de commit?',
        answer: { content: 'Trechos do handbook.', mode: 'retrieval', tools: [], sources: [] },
      }),
    )
    expect(next).toMatchObject({ id, title: 'Qual o padrão de branch?', messageCount: 4 })

    const found = await repository.find('ana', id)
    expect(found?.messages.map((message) => [message.author, message.content])).toEqual([
      ['user', 'Qual o padrão de branch?'],
      ['assistant', 'Use <tipo>/LAB-<n>-slug (ENG-GIT-02).'],
      ['user', 'E o de commit?'],
      ['assistant', 'Trechos do handbook.'],
    ])
    expect(found?.messages[1]).toMatchObject({
      author: 'assistant',
      mode: 'llm',
      tools: ['padrao'],
      sources: [{ ref: 'ENG-GIT-02' }],
    })
    expect(found?.messages[0]).not.toHaveProperty('mode')
  })

  it('keeps each person inside their own conversations', async () => {
    const mine = await repository.appendTurn(turn({ owner: 'bruno' }))
    const id = mine?.id as string
    expect(await repository.appendTurn(turn({ owner: 'carla', conversationId: id }))).toBeNull()
    expect(await repository.find('carla', id)).toBeNull()
    expect(await repository.remove('carla', id)).toBe(false)
    expect(await repository.list('carla')).toEqual([])
    expect((await repository.list('bruno')).map((c) => c.id)).toEqual([id])
    expect(await repository.find('bruno', 'nao-e-uuid')).toBeNull()
    expect(await repository.remove('bruno', 'nao-e-uuid')).toBe(false)

    expect(await repository.remove('bruno', id)).toBe(true)
    expect(await repository.find('bruno', id)).toBeNull()
    const orphans = await db.pool.query('SELECT 1 FROM chat_messages WHERE conversation_id = $1', [
      id,
    ])
    expect(orphans.rowCount).toBe(0)
  })

  it('lists the most recently active conversation first', async () => {
    const first = await repository.appendTurn(turn({ owner: 'dani', title: 'primeira' }))
    const second = await repository.appendTurn(turn({ owner: 'dani', title: 'segunda' }))
    await db.pool.query(
      `UPDATE chat_conversations SET created_at = now() - interval '2 days',
         updated_at = now() - interval '1 day' WHERE id = $1`,
      [second?.id],
    )
    expect((await repository.list('dani')).map((c) => c.title)).toEqual(['primeira', 'segunda'])
    expect(await repository.list('dani', 1)).toHaveLength(1)
    expect(first?.messageCount).toBe(2)
  })

  it('deletes conversations inactive since the cutoff, with their messages', async () => {
    const old = await repository.appendTurn(turn({ owner: 'edu', title: 'antiga' }))
    const recent = await repository.appendTurn(turn({ owner: 'edu', title: 'recente' }))
    await db.pool.query(
      `UPDATE chat_conversations SET created_at = now() - interval '100 days',
         updated_at = now() - interval '91 days' WHERE id = $1`,
      [old?.id],
    )
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
    expect(await repository.removeInactiveSince(cutoff)).toBe(1)
    expect((await repository.list('edu')).map((c) => c.id)).toEqual([recent?.id])
    await expect(repository.removeInactiveSince('ontem')).rejects.toThrow()
  })

  it('keeps the chat mode the conversation started in', async () => {
    const asked = await repository.appendTurn(turn({ owner: 'modo' }))
    expect(asked?.chatMode).toBe('ask')

    const draft = await repository.appendTurn(turn({ owner: 'modo', chatMode: 'refine-task' }))
    const id = draft?.id as string
    expect(draft?.chatMode).toBe('refine-task')
    const next = await repository.appendTurn(
      turn({ owner: 'modo', conversationId: id, chatMode: 'ask' }),
    )
    expect(next).toMatchObject({ id, chatMode: 'refine-task', messageCount: 4 })
    expect((await repository.find('modo', id))?.chatMode).toBe('refine-task')
    expect((await repository.list('modo')).map((item) => item.chatMode).sort()).toEqual([
      'ask',
      'refine-task',
    ])

    await expect(repository.appendTurn(turn({ chatMode: 'Modo Livre' }))).rejects.toThrow()
    await expect(
      db.pool.query(
        `INSERT INTO chat_conversations (owner, title, chat_mode) VALUES ('x', 'y', 'DROP')`,
      ),
    ).rejects.toThrow(/chat_conversations_chat_mode_check|violates check constraint/)
  })

  it('refuses plain e-mail or CPF in stored text and invalid turns', async () => {
    await expect(
      repository.appendTurn(turn({ owner: 'fabi', question: 'sou fabi@exemplo.com' })),
    ).rejects.toThrow(/check constraint/)
    await expect(
      repository.appendTurn(turn({ owner: 'fabi', question: 'cpf 123.456.789-09' })),
    ).rejects.toThrow(/check constraint/)
    expect(await repository.list('fabi')).toEqual([])
    await expect(repository.appendTurn(turn({ owner: ' ' }))).rejects.toThrow()
    await expect(
      repository.appendTurn(turn({ answer: { ...turn().answer, mode: 'outro' as 'llm' } })),
    ).rejects.toThrow()
  })
})
