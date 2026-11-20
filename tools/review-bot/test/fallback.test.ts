import { describe, expect, it } from 'vitest'
import { findPage, findTask } from '../src/sources/fallback.js'
import type { DocPage, DocSource, Task, TaskSource } from '../src/sources/types.js'

const task = (key: string): Task => ({
  key,
  title: 't',
  description: 'd',
  acceptanceCriteria: [],
  status: 's',
  labels: [],
  epic: null,
  url: null,
})

const taskSource = (name: string, keys: string[]): TaskSource => ({
  name,
  getTask: async (key) => (keys.includes(key) ? task(key) : null),
})

const docSource = (name: string, ids: string[]): DocSource => ({
  name,
  getPage: async (id): Promise<DocPage | null> =>
    ids.includes(id) ? { id, title: name, text: '', updatedAt: null, url: null } : null,
})

describe('fontes em cascata', () => {
  it('usa a primeira fonte que tem a task e informa a origem', async () => {
    const sources = [taskSource('base', ['LAB-1']), taskSource('pr', ['LAB-1', 'LAB-8'])]
    expect(await findTask(sources, 'LAB-1')).toMatchObject({ origin: 'base' })
    expect(await findTask(sources, 'LAB-8')).toMatchObject({
      origin: 'pr',
      value: { key: 'LAB-8' },
    })
    expect(await findTask(sources, 'LAB-9')).toBeNull()
  })

  it('prefere a documentação do PR quando existe', async () => {
    const sources = [docSource('pr', ['p1']), docSource('base', ['p1', 'p2'])]
    expect(await findPage(sources, 'p1')).toMatchObject({ origin: 'pr' })
    expect(await findPage(sources, 'p2')).toMatchObject({ origin: 'base' })
    expect(await findPage(sources, 'p3')).toBeNull()
  })
})
