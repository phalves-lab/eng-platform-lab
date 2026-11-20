import { COMMENT_MARKER } from './review.js'

export interface GitHubOptions {
  token: string
  repository: string
  fetchImpl?: typeof fetch
}

interface IssueComment {
  id: number
  body?: string
}

export const listPullFiles = async (
  options: GitHubOptions,
  pullNumber: number,
): Promise<string[]> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const files: string[] = []
  for (let page = 1; page <= 30; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${options.repository}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    )
    if (!response.ok)
      throw new Error(`GitHub respondeu ${response.status} ao listar arquivos do PR.`)
    const batch = (await response.json()) as { filename: string }[]
    files.push(...batch.map((f) => f.filename))
    if (batch.length < 100) break
  }
  return files
}

export const listCheckRuns = async (
  options: GitHubOptions,
  sha: string,
): Promise<{ name: string; conclusion: string }[]> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(
    `https://api.github.com/repos/${options.repository}/commits/${sha}/check-runs?per_page=100`,
    {
      headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json' },
    },
  )
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao listar checks.`)
  const data = (await response.json()) as {
    check_runs: { name: string; status: string; conclusion: string | null }[]
  }
  return data.check_runs.map((run) => ({
    name: run.name,
    conclusion: run.conclusion ?? run.status,
  }))
}

/**
 * Publica ou atualiza o comentário fixo do bot. Usa só a API de comentários de issue: o bot
 * não tem caminho de código para aprovar, pedir mudanças ou mergear.
 */
export const upsertStickyComment = async (
  options: GitHubOptions,
  pullNumber: number,
  body: string,
): Promise<'created' | 'updated'> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = {
    Authorization: `Bearer ${options.token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
  const base = `https://api.github.com/repos/${options.repository}/issues`

  const listed = await fetchImpl(`${base}/${pullNumber}/comments?per_page=100`, { headers })
  if (!listed.ok) throw new Error(`GitHub respondeu ${listed.status} ao listar comentários.`)
  const existing = ((await listed.json()) as IssueComment[]).find((c) =>
    c.body?.includes(COMMENT_MARKER),
  )

  const response = existing
    ? await fetchImpl(`${base}/comments/${existing.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body }),
      })
    : await fetchImpl(`${base}/${pullNumber}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      })
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao publicar comentário.`)
  return existing ? 'updated' : 'created'
}
