import { describe, expect, it } from 'vitest'
import {
  cfdSeries,
  CFD_ORDER,
  formatEpicProgress,
  resolveBoard,
  sprintSentence,
  sprintSeries,
} from '../src/lib/boards'

const sprint = {
  id: 5,
  name: 'LAB Sprint 5',
  state: 'active' as const,
  startsAt: '2026-11-16T12:00:00.000Z',
  endsAt: '2026-11-30T12:00:00.000Z',
  planned: 5,
  added: 1,
  delivered: 4,
  deliveredPlanned: 3,
}

describe('boards helpers', () => {
  it('picks the requested board only when it exists', () => {
    const boards = [{ project: 'LAB' }, { project: 'OPS' }]
    expect(resolveBoard('ops', boards)).toBe('OPS')
    expect(resolveBoard(['OPS', 'LAB'], boards)).toBe('OPS')
    expect(resolveBoard('XYZ', boards)).toBe('LAB')
    expect(resolveBoard('x-1', boards)).toBe('LAB')
    expect(resolveBoard(undefined, [])).toBeNull()
  })

  it('stacks the cumulative flow with done at the bottom and formats days', () => {
    expect(CFD_ORDER[0]).toBe('done')
    expect(CFD_ORDER.at(-1)).toBe('todo')
    expect(
      cfdSeries([{ day: '2026-11-20', todo: 1, in_progress: 2, review: 0, blocked: 1, done: 9 }]),
    ).toEqual([{ day: '20/11', todo: 1, in_progress: 2, review: 0, blocked: 1, done: 9 }])
  })

  it('describes planned against delivered for each sprint', () => {
    expect(sprintSeries([sprint, { ...sprint, state: 'closed', name: 'Ciclo 4' }], 'LAB')).toEqual([
      { sprint: 'Sprint 5 (ativa)', planned: 5, added: 1, delivered: 4 },
      { sprint: 'Ciclo 4', planned: 5, added: 1, delivered: 4 },
    ])
    expect(sprintSentence(sprint)).toBe(
      '3 de 5 previstos entregues; 1 item entrou depois do início; 4 entregues no total.',
    )
    expect(sprintSentence({ ...sprint, added: 0 })).toContain('nada entrou depois do início')
    expect(sprintSentence({ ...sprint, added: 2 })).toContain('2 itens entraram')
  })

  it('formats epic progress', () => {
    expect(formatEpicProgress(0, 0)).toBe('Sem itens ligados')
    expect(formatEpicProgress(3, 4)).toBe('3 de 4 concluídos')
  })
})
