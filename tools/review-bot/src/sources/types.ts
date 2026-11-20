export interface Task {
  key: string
  title: string
  description: string
  acceptanceCriteria: string[]
  status: string
  labels: string[]
  epic: string | null
  url: string | null
  area?: string | null
  demandType?: string | null
}

export interface DocPage {
  id: string
  title: string
  text: string
  updatedAt: string | null
  url: string | null
}

export interface TaskSource {
  readonly name: string
  getTask(key: string): Promise<Task | null>
}

export interface DocSource {
  readonly name: string
  getPage(id: string): Promise<DocPage | null>
}
