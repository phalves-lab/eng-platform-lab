import { describe, expect, it } from 'vitest'
import {
  AskRequestSchema,
  AskResponseSchema,
  StandardFilterSchema,
  StandardSchema,
  UserSchema,
} from '../src/index.js'

describe('contracts', () => {
  it('accepts valid payloads and rejects invalid ones', () => {
    expect(
      StandardSchema.parse({
        id: 'ENG-GIT-01',
        area: 'ENG-GIT',
        title: 'Base',
        status: 'VIGENTE',
        fields: { Regra: 'x' },
        text: 'x',
        source: 'a.md',
      }).id,
    ).toBe('ENG-GIT-01')
    expect(StandardSchema.safeParse({ id: 'x' }).success).toBe(false)
    expect(AskRequestSchema.parse({ question: '  qual o padrão?  ' }).question).toBe(
      'qual o padrão?',
    )
    expect(AskRequestSchema.safeParse({ question: 'a' }).success).toBe(false)
    expect(AskResponseSchema.safeParse({ mode: 'llm', answer: '', sources: [] }).success).toBe(
      false,
    )
    expect(UserSchema.safeParse({ login: 'a', name: 'A', role: 'owner' }).success).toBe(false)
    expect(StandardFilterSchema.parse({ status: 'LACUNA' })).toEqual({ status: 'LACUNA' })
  })
})
