import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const TaskKeySchema = z.string().regex(/^[A-Z][A-Z0-9]+-\d{1,6}$/)

export const TaskFixtureSchema = z.object({
  key: TaskKeySchema,
  title: z.string(),
  area: z.string().optional(),
  demandType: z.string().optional(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  status: z.string().optional(),
  labels: z.array(z.string()).default([]),
  epic: z.string().nullable().optional(),
})
export type TaskFixture = z.infer<typeof TaskFixtureSchema>

const isMissing = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

/** Synthetic tasks in the same JSON files the review bot reads (`fixtures/jira/<KEY>.json`). */
export class TaskFixtures {
  constructor(private readonly directory: string) {}

  /** Returns null for a key without a file; the key format keeps reads inside the folder. */
  async find(key: string): Promise<TaskFixture | null> {
    const parsedKey = TaskKeySchema.safeParse(key)
    if (!parsedKey.success) return null
    let text: string
    try {
      text = await readFile(join(this.directory, `${parsedKey.data}.json`), 'utf8')
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
    return TaskFixtureSchema.parse(JSON.parse(text))
  }
}
