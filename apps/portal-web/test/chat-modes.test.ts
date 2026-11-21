import type { ChatMode } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import { newTurn } from '../src/lib/ask-stream'
import {
  ASK_MODE,
  chatRequestBody,
  copyableDraft,
  findMode,
  selectableModes,
} from '../src/lib/chat-modes'

const ID = '0f8b2c64-8f3e-4b8e-9d5a-2f1e6c7b9a10'

const refine: ChatMode = {
  ...ASK_MODE,
  id: 'refine-task',
  label: 'Refinar task',
  draft: true,
  maxLength: 8000,
}

describe('modos do chat no front', () => {
  it('cai no modo Perguntar quando o modo não está na lista', () => {
    expect(findMode([ASK_MODE, refine], 'refine-task')).toBe(refine)
    expect(findMode([ASK_MODE, refine], 'adr')).toBe(ASK_MODE)
    expect(findMode([refine], 'adr')).toEqual(ASK_MODE)
  })

  it('mantém o modo Perguntar sempre disponível na seleção', () => {
    expect(selectableModes([refine]).map((mode) => mode.id)).toEqual(['ask', 'refine-task'])
    expect(selectableModes([ASK_MODE, refine])).toEqual([ASK_MODE, refine])
  })

  it('manda o modo no pedido e a conversa só quando ela existe', () => {
    expect(chatRequestBody('Refine a LAB-53', 'refine-task', null)).toEqual({
      question: 'Refine a LAB-53',
      mode: 'refine-task',
    })
    expect(chatRequestBody('Outra', 'adr', ID)).toEqual({
      question: 'Outra',
      mode: 'adr',
      conversationId: ID,
    })
  })

  it('só oferece copiar o rascunho terminado e escrito pelo modelo', () => {
    const streaming = { ...newTurn(1, 'x'), text: 'parcial' }
    expect(copyableDraft(streaming)).toBeNull()
    const done = {
      ...streaming,
      status: 'done' as const,
      text: '  Título: feat: x  ',
      response: { mode: 'llm' as const, answer: 'Título: feat: x', citations: [] },
    }
    expect(copyableDraft(done)).toBe('Título: feat: x')
    expect(
      copyableDraft({
        ...done,
        response: { mode: 'retrieval', answer: 'Os rascunhos precisam do modelo', sources: [] },
      }),
    ).toBeNull()
    expect(copyableDraft({ ...done, text: '   ' })).toBeNull()
  })
})
