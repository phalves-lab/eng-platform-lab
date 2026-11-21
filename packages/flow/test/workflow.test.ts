import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadWorkflow, parseWorkflow, unmappedStatuses } from '../src/index.js'

const CATALOG = fileURLToPath(new URL('../../../catalog/jira/workflow.yaml', import.meta.url))

const base = `
categories:
  - { id: todo, label: A fazer, statuses: [A fazer] }
  - { id: in_progress, label: Em andamento, statuses: [Em andamento] }
  - { id: review, label: Em review, statuses: [Code Review] }
  - { id: blocked, label: Bloqueado, statuses: [Bloqueado] }
  - { id: done, label: Concluído, statuses: [Concluído] }
`

describe('workflow', () => {
  it('loads the versioned catalog with the five columns in board order', async () => {
    const workflow = await loadWorkflow(CATALOG)
    expect(workflow.columns.map((column) => column.id)).toEqual([
      'todo',
      'in_progress',
      'review',
      'blocked',
      'done',
    ])
    expect(workflow.classify('LAB', 'Code Review')).toBe('review')
    expect(workflow.classify('OPS', 'Em execução')).toBe('in_progress')
    expect(workflow.classify('LAB', 'Em execução')).toBeNull()
  })

  it('matches statuses ignoring case and surrounding spaces', () => {
    const workflow = parseWorkflow(base)
    expect(workflow.classify('LAB', '  em ANDAMENTO ')).toBe('in_progress')
    expect(workflow.classify('LAB', 'concluído')).toBe('done')
  })

  it('adds project statuses on top of the shared ones', () => {
    const workflow = parseWorkflow(
      `${base}\nprojects:\n  OPS:\n    blocked: [Aguardando fornecedor]\n`,
    )
    expect(workflow.classify('OPS', 'Aguardando fornecedor')).toBe('blocked')
    expect(workflow.classify('OPS', 'Bloqueado')).toBe('blocked')
    expect(workflow.classify('LAB', 'Aguardando fornecedor')).toBeNull()
  })

  it('rejects a status claimed by two categories', () => {
    expect(() =>
      parseWorkflow(base.replace('statuses: [Code Review]', 'statuses: [Code Review, A fazer]')),
    ).toThrow('Status "A fazer" maps to todo and review in the shared workflow')
    expect(() => parseWorkflow(`${base}\nprojects:\n  OPS:\n    done: [Em andamento]\n`)).toThrow(
      'in OPS',
    )
  })

  it('requires every category exactly once', () => {
    expect(() =>
      parseWorkflow(
        base.replace('  - { id: done, label: Concluído, statuses: [Concluído] }\n', ''),
      ),
    ).toThrow('categories must list each of todo, in_progress, review, blocked, done once')
    expect(() => parseWorkflow(base.replace('id: done', 'id: todo'))).toThrow('Invalid workflow')
  })

  it('lists each unknown project and status pair once', () => {
    const workflow = parseWorkflow(base)
    expect(
      unmappedStatuses(workflow, [
        { project: 'LAB', status: 'A fazer' },
        { project: 'LAB', status: 'Triagem' },
        { project: 'LAB', status: 'Triagem' },
        { project: 'OPS', status: 'Triagem' },
      ]),
    ).toEqual([
      { project: 'LAB', status: 'Triagem' },
      { project: 'OPS', status: 'Triagem' },
    ])
  })
})
