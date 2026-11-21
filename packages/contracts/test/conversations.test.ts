import { describe, expect, it } from 'vitest'
import {
  ChatRequestSchema,
  ChatStreamEventSchema,
  ConversationSchema,
  encodeSseEvent,
} from '../src/index.js'

const ID = '0f8b2c64-8f3e-4b8e-9d5a-2f1e6c7b9a10'
const summary = {
  id: ID,
  title: 'Qual o padrão de branch?',
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:05:00.000Z',
  messageCount: 2,
}

describe('conversation contracts', () => {
  it('accepts a question with or without a conversation to continue', () => {
    expect(ChatRequestSchema.parse({ question: '  Qual o padrão?  ' })).toEqual({
      question: 'Qual o padrão?',
    })
    expect(ChatRequestSchema.parse({ question: 'Qual o padrão?', conversationId: ID })).toEqual({
      question: 'Qual o padrão?',
      conversationId: ID,
    })
    expect(ChatRequestSchema.safeParse({ question: 'ab' }).success).toBe(false)
    expect(ChatRequestSchema.safeParse({ question: 'abc', conversationId: '1' }).success).toBe(
      false,
    )
  })

  it('reads a stored conversation with the answer in the same shape as the chat', () => {
    const conversation = ConversationSchema.parse({
      ...summary,
      messages: [
        { author: 'user', content: 'Qual o padrão de branch?', createdAt: summary.createdAt },
        {
          author: 'assistant',
          tools: ['padrao'],
          response: { mode: 'llm', answer: 'Use ENG-GIT-02.', citations: [] },
          createdAt: summary.createdAt,
        },
      ],
    })
    expect(conversation.messages[1]).toMatchObject({ response: { mode: 'llm' } })
    expect(
      ConversationSchema.safeParse({
        ...summary,
        messages: [{ author: 'assistant', tools: [], response: { mode: 'x' }, createdAt: '' }],
      }).success,
    ).toBe(false)
  })

  it('accepts the answer events plus the saved conversation event', () => {
    const events = [
      { type: 'start', mode: 'llm' },
      { type: 'done', response: { mode: 'retrieval', answer: 'x', sources: [] } },
      { type: 'conversation', conversation: summary },
    ]
    for (const event of events) {
      const wire = encodeSseEvent(event).slice(6).trim()
      expect(ChatStreamEventSchema.parse(JSON.parse(wire))).toEqual(event)
    }
    expect(ChatStreamEventSchema.safeParse({ type: 'conversation' }).success).toBe(false)
  })
})
