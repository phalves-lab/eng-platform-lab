import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { demoDataset } from './demo.js'
import { fetchPullRequests } from './github.js'
import { buildPanelData, type DatasetSource } from './panel-data.js'
import { fetchJiraTasks, loadFixtureTasks } from './tasks.js'
import { daysAgo } from './time.js'
import type { Dataset } from './types.js'

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'site' },
    repository: { type: 'string', default: process.env.GITHUB_REPOSITORY ?? '' },
    fixtures: { type: 'string', default: 'fixtures/jira' },
    source: { type: 'string', default: 'fixtures' },
    demo: { type: 'boolean', default: false },
    'only-demo': { type: 'boolean', default: false },
  },
})

const collectLab = async (now: string): Promise<DatasetSource> => {
  const token = process.env.GITHUB_TOKEN
  if (!token || !values.repository) throw new Error('Defina GITHUB_TOKEN e GITHUB_REPOSITORY.')

  const pullRequests = await fetchPullRequests({
    token,
    repository: values.repository,
    since: daysAgo(now, 90),
  })

  let tasks
  if (values.source === 'jira') {
    if (process.env.CI === 'true') throw new Error('Leitura do Jira real só roda localmente.')
    const keys = [
      ...new Set(pullRequests.map((pr) => pr.taskKey).filter((k): k is string => Boolean(k))),
    ]
    tasks = await fetchJiraTasks(keys, {
      site: process.env.ATLASSIAN_SITE ?? '',
      email: process.env.ATLASSIAN_EMAIL ?? '',
      apiToken: process.env.ATLASSIAN_API_TOKEN ?? '',
    })
  } else {
    tasks = await loadFixtureTasks(resolve(values.fixtures))
  }

  const dataset: Dataset = {
    label: `Laboratório (${values.repository})`,
    generatedAt: now,
    pullRequests,
    tasks,
  }
  return { id: 'lab', title: 'Laboratório', dataset }
}

const main = async () => {
  const now = new Date().toISOString()
  const sources: DatasetSource[] = values['only-demo'] ? [] : [await collectLab(now)]
  if (values.demo || values['only-demo'])
    sources.push({ id: 'demo', title: 'Exemplo com time de 8', dataset: demoDataset(now) })

  const out = resolve(values.out)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'data.json'), JSON.stringify(buildPanelData(sources, now), null, 2))
  console.log(
    `Dados do painel gerados em ${join(out, 'data.json')} (${sources.length} conjunto(s)).`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
