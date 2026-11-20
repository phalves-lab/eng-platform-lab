import { ReadOnlyHttp } from './read-only-http.js'
import { adfToText, extractAcceptanceCriteria, storageToText } from './text.js'
import type { DocPage, DocSource, Task, TaskSource } from './types.js'

interface JiraIssue {
  key: string
  fields: {
    summary: string
    description: unknown
    status?: { name?: string }
    labels?: string[]
    parent?: { key?: string; fields?: { summary?: string } }
    [field: string]: unknown
  }
}

interface ConfluencePage {
  id: string
  title: string
  version?: { createdAt?: string }
  body?: { storage?: { value?: string } }
  _links?: { webui?: string; base?: string }
}

export interface AtlassianSourceOptions {
  site: string
  email: string
  apiToken: string
  acceptanceField?: string
  fetchImpl?: typeof fetch
}

const toHttp = (options: AtlassianSourceOptions) =>
  new ReadOnlyHttp({
    baseUrl: `https://${options.site}`,
    email: options.email,
    apiToken: options.apiToken,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  })

export class JiraTaskSource implements TaskSource {
  readonly name = 'jira'
  private readonly http: ReadOnlyHttp

  constructor(private readonly options: AtlassianSourceOptions) {
    this.http = toHttp(options)
  }

  async getTask(key: string): Promise<Task | null> {
    const fields = ['summary', 'description', 'status', 'labels', 'parent']
    if (this.options.acceptanceField) fields.push(this.options.acceptanceField)
    const issue = await this.http.getJson<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields.join(',')}`,
    )
    if (!issue) return null

    const description = adfToText(issue.fields.description).trim()
    const fromField = this.options.acceptanceField
      ? extractAcceptanceCriteria(
          `Critérios de aceite\n${adfToText(issue.fields[this.options.acceptanceField])}`,
        )
      : []
    const parent = issue.fields.parent

    return {
      key: issue.key,
      title: issue.fields.summary,
      description,
      acceptanceCriteria: fromField.length > 0 ? fromField : extractAcceptanceCriteria(description),
      status: issue.fields.status?.name ?? 'desconhecido',
      labels: issue.fields.labels ?? [],
      epic: parent?.key ? `${parent.key} ${parent.fields?.summary ?? ''}`.trim() : null,
      url: `https://${this.options.site}/browse/${issue.key}`,
    }
  }
}

export class ConfluenceDocSource implements DocSource {
  readonly name = 'confluence'
  private readonly http: ReadOnlyHttp

  constructor(private readonly options: AtlassianSourceOptions) {
    this.http = toHttp(options)
  }

  async getPage(id: string): Promise<DocPage | null> {
    const page = await this.http.getJson<ConfluencePage>(
      `/wiki/api/v2/pages/${encodeURIComponent(id)}?body-format=storage`,
    )
    if (!page) return null
    return {
      id: page.id,
      title: page.title,
      text: storageToText(page.body?.storage?.value ?? ''),
      updatedAt: page.version?.createdAt ?? null,
      url: page._links?.webui ? `https://${this.options.site}/wiki${page._links.webui}` : null,
    }
  }
}
