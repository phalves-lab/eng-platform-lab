import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { collectPanelData } from './collect.js'

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

const main = async () => {
  const now = new Date().toISOString()
  const data = await collectPanelData(
    {
      lab: values['only-demo']
        ? null
        : {
            token: process.env.GITHUB_TOKEN ?? '',
            repository: values.repository,
            taskSource: values.source === 'jira' ? 'jira' : 'fixtures',
            fixturesDir: resolve(values.fixtures),
            jira: {
              site: process.env.ATLASSIAN_SITE ?? '',
              email: process.env.ATLASSIAN_EMAIL ?? '',
              apiToken: process.env.ATLASSIAN_API_TOKEN ?? '',
            },
            ci: process.env.CI === 'true',
          },
      demo: values.demo || values['only-demo'],
    },
    now,
  )

  const out = resolve(values.out)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'data.json'), JSON.stringify(data, null, 2))
  console.log(
    `Dados do painel gerados em ${join(out, 'data.json')} (${data.datasets.length} conjunto(s)).`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
