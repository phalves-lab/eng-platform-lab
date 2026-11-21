import type { Conversation, ConversationSummary } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  conversationHref,
  parseConversationId,
  questionCount,
  turnsFromConversation,
  upsertConversation,
} from '../src/lib/conversations'

const ID = '0f8b2c64-8f3e-4b8e-9d5a-2f1e6c7b9a10'
const AT = '2026-11-21T12:00:00.000Z'

const summary = (id: string, messageCount = 2): ConversationSummary => ({
  id,
  title: `Conversa ${id.slice(0, 4)}`,
  createdAt: AT,
  updatedAt: AT,
  messageCount,
  chatMode: 'ask',
})

describe('histórico de conversas no front', () => {
  it('lê o ID da conversa da URL só quando é um UUID', () => {
    expect(parseConversationId(ID)).toBe(ID)
    expect(parseConversationId([ID, 'outro'])).toBe(ID)
    expect(parseConversationId('123')).toBeNull()
    expect(parseConversationId(undefined)).toBeNull()
    expect(conversationHref(ID)).toBe(`/pergunte?conversa=${ID}`)
    expect(conversationHref(null)).toBe('/pergunte')
  })

  it('remonta cada pergunta com a resposta guardada e marca a que ficou sem resposta', () => {
    const conversation: Conversation = {
      ...summary(ID, 3),
      messages: [
        { author: 'user', content: 'Qual o padrão de branch?', createdAt: AT },
        {
          author: 'assistant',
          tools: ['padrao'],
          response: { mode: 'llm', answer: 'Use ENG-GIT-02.', citations: [] },
          createdAt: AT,
        },
        {
          author: 'assistant',
          tools: [],
          response: { mode: 'retrieval', answer: 'duplicada', sources: [] },
          createdAt: AT,
        },
        { author: 'user', content: 'E o commit?', createdAt: AT },
      ],
    }
    const turns = turnsFromConversation(conversation)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      id: 0,
      question: 'Qual o padrão de branch?',
      mode: 'llm',
      text: 'Use ENG-GIT-02.',
      tools: ['padrao'],
      status: 'done',
      error: null,
    })
    expect(turns[1]).toMatchObject({ id: 1, question: 'E o commit?', status: 'error' })
    expect(
      turnsFromConversation({
        ...conversation,
        messages: [conversation.messages[1] as Conversation['messages'][number]],
      }),
    ).toEqual([])
  })

  it('sobe a conversa salva para o topo sem duplicar e conta as perguntas', () => {
    const a = summary('aaaa-1')
    const b = summary('bbbb-2')
    expect(upsertConversation([a, b], { ...b, messageCount: 4 }).map((c) => c.id)).toEqual([
      'bbbb-2',
      'aaaa-1',
    ])
    expect(upsertConversation([], a)).toEqual([a])
    expect(questionCount(summary(ID, 2))).toBe('1 pergunta')
    expect(questionCount(summary(ID, 6))).toBe('3 perguntas')
  })
})
