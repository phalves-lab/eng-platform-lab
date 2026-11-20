import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocPage, DocSource, Task, TaskSource } from './types.js'

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export class FixtureTaskSource implements TaskSource {
  constructor(
    private readonly directory: string,
    readonly name = 'fixtures',
  ) {}

  getTask(key: string): Promise<Task | null> {
    return readJson<Task>(join(this.directory, `${key}.json`))
  }
}

export class FixtureDocSource implements DocSource {
  constructor(
    private readonly directory: string,
    readonly name = 'fixtures',
  ) {}

  getPage(id: string): Promise<DocPage | null> {
    return readJson<DocPage>(join(this.directory, `${id}.json`))
  }
}
