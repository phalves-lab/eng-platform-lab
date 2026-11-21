import { createServer } from 'node:http'

const REPO = '/repos/phalves-lab/eng-platform-lab'
const port = Number(process.env.E2E_GITHUB_PORT ?? 4601)

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const merged = [
  {
    number: 901,
    title: 'feat(portal): filtro por time no Fluxo (LAB-901)',
    author: 'ana.dev',
    days: 1,
  },
  {
    number: 902,
    title: 'fix(api): cache da prévia de release (LAB-902)',
    author: 'bruno.dev',
    days: 2,
  },
  { number: 903, title: 'chore(ci): job de imagens (LAB-903)', author: 'carla.dev', days: 3 },
].map(({ number, title, author, days }) => ({
  number,
  title,
  html_url: `https://github.example.invalid/pr/${number}`,
  body: `**Task:** LAB-${number}`,
  user: { login: author },
  head: { ref: `feat/LAB-${number}-e2e`, sha: `${number}`.padEnd(40, 'a') },
  base: { ref: 'develop' },
  labels: [],
  merged_at: daysAgo(days),
  updated_at: daysAgo(days),
}))

const routes: Record<string, unknown> = {
  [`${REPO}/branches`]: [{ name: 'develop' }, { name: 'main' }],
  [`${REPO}/compare/main...develop`]: { ahead_by: 3, behind_by: 0 },
  [`${REPO}/commits/develop/check-runs`]: {
    check_runs: [{ name: 'gates', status: 'completed', conclusion: 'success' }],
  },
  [`${REPO}/tags`]: [],
}

const answer = (path: string, query: URLSearchParams): unknown => {
  if (path === `${REPO}/pulls`) {
    if (query.get('state') !== 'closed') return []
    return query.get('base') === 'develop' ? merged : []
  }
  return routes[path]
}

/** Read-only stand-in for the GitHub REST API with synthetic data for the release preview. */
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://fake-github')
  const body = request.method === 'GET' ? answer(url.pathname, url.searchParams) : undefined
  response.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body ?? { message: 'Not Found' }))
}).listen(port, '127.0.0.1')
