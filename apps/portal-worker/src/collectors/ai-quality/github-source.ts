import { type ParsedArtifact, parseArtifact } from '@lab/llm-usage'
import { z } from 'zod'
import type { AiArtifactSource } from './source.js'
import { readZip } from './zip.js'

export const AI_ARTIFACT_NAME = 'ai-quality'
const DEFAULT_MAX_ARTIFACTS = 30

export class GitHubArtifactError extends Error {
  override readonly name = 'GitHubArtifactError'

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface GitHubArtifactOptions {
  token: string
  repository: string
  apiUrl?: string
  fetchImpl?: typeof fetch
  maxArtifacts?: number
}

const ArtifactListSchema = z.object({
  artifacts: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      expired: z.boolean(),
      created_at: z.string().nullish(),
    }),
  ),
})

/**
 * Read-only adapter: lists the `ai-quality` artifacts of the workflows (evals, chat-evals and
 * ai-review) and downloads each archive. Only GET requests leave this module.
 */
export const createGitHubArtifactSource = (options: GitHubArtifactOptions): AiArtifactSource => {
  const apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const limit = options.maxArtifacts ?? DEFAULT_MAX_ARTIFACTS

  const get = async (path: string, accept: string) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) {
      throw new GitHubArtifactError(
        response.status,
        `GitHub respondeu ${response.status} em ${path.split('?')[0]}`,
      )
    }
    return response
  }

  const download = async (id: number): Promise<ParsedArtifact[]> => {
    const response = await get(
      `/repos/${options.repository}/actions/artifacts/${id}/zip`,
      'application/vnd.github+json',
    )
    return readZip(Buffer.from(await response.arrayBuffer()))
      .filter((entry) => entry.name.endsWith('.json'))
      .map((entry) => parseArtifact(`${id}/${entry.name}`, entry.content.toString('utf8')))
  }

  return {
    collect: async () => {
      const listed = ArtifactListSchema.parse(
        await (
          await get(
            `/repos/${options.repository}/actions/artifacts?name=${AI_ARTIFACT_NAME}&per_page=100`,
            'application/vnd.github+json',
          )
        ).json(),
      )
      const artifacts = listed.artifacts
        .filter((artifact) => artifact.name === AI_ARTIFACT_NAME && !artifact.expired)
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id)
        .slice(0, limit)
      const parsed: ParsedArtifact[] = []
      const failures: string[] = []
      for (const artifact of artifacts) {
        try {
          parsed.push(...(await download(artifact.id)))
        } catch (error) {
          failures.push(`${artifact.id}: ${error instanceof Error ? error.message : error}`)
        }
      }
      return { source: 'github', parsed, failures }
    },
  }
}
