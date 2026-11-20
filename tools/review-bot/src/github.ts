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
