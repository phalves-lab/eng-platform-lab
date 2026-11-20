export class WriteAttemptError extends Error {
  constructor(method: string, url: string) {
    super(`Cliente somente leitura recusou ${method} ${url}.`)
    this.name = 'WriteAttemptError'
  }
}

export interface ReadOnlyHttpOptions {
  baseUrl: string
  email: string
  apiToken: string
  fetchImpl?: typeof fetch
}

/**
 * Cliente HTTP do Atlassian que só executa GET. A garantia de leitura fica no transporte,
 * então nenhuma fonte de contexto consegue escrever no Jira ou no Confluence por engano.
 */
export class ReadOnlyHttp {
  private readonly fetchImpl: typeof fetch
  private readonly authorization: string

  constructor(private readonly options: ReadOnlyHttpOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.authorization = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString('base64')}`
  }

  async request(method: string, path: string): Promise<Response> {
    const url = new URL(path, this.options.baseUrl).toString()
    if (method.toUpperCase() !== 'GET') throw new WriteAttemptError(method, url)
    return this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: this.authorization, Accept: 'application/json' },
    })
  }

  async getJson<T>(path: string): Promise<T | null> {
    const response = await this.request('GET', path)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Atlassian respondeu ${response.status} em ${path}.`)
    return (await response.json()) as T
  }
}
