export type WritePlan =
  | { kind: 'jira-comment'; target: string; body: string }
  | { kind: 'confluence-update'; target: string; title: string; storageBody: string }

export interface WriteEnvironment {
  confirmFlag: boolean
  isTTY: boolean
  isCI: boolean
  ask: (question: string) => Promise<string>
}

export type WriteDecision =
  { execute: true } | { execute: false; reason: 'dry-run' | 'ci' | 'no-tty' | 'not-confirmed' }

export const describePlan = (plan: WritePlan): string => {
  if (plan.kind === 'jira-comment') {
    return `Criar comentário na issue ${plan.target}:\n\n${plan.body}`
  }
  return `Atualizar a página ${plan.target} do Confluence com o título "${plan.title}":\n\n${plan.storageBody}`
}

/**
 * Decide se uma escrita no Atlassian pode acontecer. Só executa com a flag --confirm, em
 * terminal interativo, fora de CI e depois de o operador digitar o alvo exato. Qualquer
 * outra combinação vira simulação.
 */
export const decideWrite = async (
  plan: WritePlan,
  env: WriteEnvironment,
): Promise<WriteDecision> => {
  if (env.isCI) return { execute: false, reason: 'ci' }
  if (!env.confirmFlag) return { execute: false, reason: 'dry-run' }
  if (!env.isTTY) return { execute: false, reason: 'no-tty' }
  const answer = await env.ask(`Digite "${plan.target}" para confirmar a escrita: `)
  return answer.trim() === plan.target
    ? { execute: true }
    : { execute: false, reason: 'not-confirmed' }
}

export interface AtlassianWriterOptions {
  site: string
  email: string
  apiToken: string
  fetchImpl?: typeof fetch
}

const textToAdf = (text: string) => ({
  type: 'doc',
  version: 1,
  content: text
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph.trim() }],
    })),
})

export const executeWritePlan = async (
  plan: WritePlan,
  options: AtlassianWriterOptions,
): Promise<{ status: number }> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = {
    Authorization: `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const base = `https://${options.site}`

  if (plan.kind === 'jira-comment') {
    const response = await fetchImpl(
      `${base}/rest/api/3/issue/${encodeURIComponent(plan.target)}/comment`,
      { method: 'POST', headers, body: JSON.stringify({ body: textToAdf(plan.body) }) },
    )
    if (!response.ok) throw new Error(`Jira respondeu ${response.status}.`)
    return { status: response.status }
  }

  const current = await fetchImpl(`${base}/wiki/api/v2/pages/${encodeURIComponent(plan.target)}`, {
    headers,
  })
  if (!current.ok) throw new Error(`Confluence respondeu ${current.status} ao ler a versão.`)
  const page = (await current.json()) as { version?: { number?: number } }
  const nextVersion = (page.version?.number ?? 0) + 1

  const response = await fetchImpl(`${base}/wiki/api/v2/pages/${encodeURIComponent(plan.target)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      id: plan.target,
      status: 'current',
      title: plan.title,
      body: { representation: 'storage', value: plan.storageBody },
      version: { number: nextVersion, message: 'Atualização confirmada pelo operador' },
    }),
  })
  if (!response.ok) throw new Error(`Confluence respondeu ${response.status}.`)
  return { status: response.status }
}
