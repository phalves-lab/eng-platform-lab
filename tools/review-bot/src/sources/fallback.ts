import type { DocPage, DocSource, Task, TaskSource } from './types.js'

export interface Found<T> {
  value: T
  origin: string
}

/** Devolve a primeira task encontrada, na ordem das fontes, com o nome da fonte que respondeu. */
export const findTask = async (sources: TaskSource[], key: string): Promise<Found<Task> | null> => {
  for (const source of sources) {
    const task = await source.getTask(key)
    if (task) return { value: task, origin: source.name }
  }
  return null
}

export const findPage = async (
  sources: DocSource[],
  id: string,
): Promise<Found<DocPage> | null> => {
  for (const source of sources) {
    const page = await source.getPage(id)
    if (page) return { value: page, origin: source.name }
  }
  return null
}
