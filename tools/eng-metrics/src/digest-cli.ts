import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { PanelData } from './contract.js'
import { buildDigest, postDigest } from './digest.js'

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'site/data.json' },
    dataset: { type: 'string', default: 'lab' },
    url: { type: 'string', default: 'https://phalves-lab.github.io/eng-platform-lab/' },
    out: { type: 'string' },
    post: { type: 'boolean', default: false },
  },
})

const main = async () => {
  const data = JSON.parse(await readFile(resolve(values.data), 'utf8')) as PanelData
  const dataset = data.datasets.find((item) => item.id === values.dataset)
  if (!dataset) throw new Error(`Conjunto "${values.dataset}" não está em ${values.data}.`)

  const link = `${values.url}#/visao-geral?conjunto=${encodeURIComponent(dataset.id)}`
  const text = buildDigest(dataset, link)
  console.log(text)

  if (values.out) await writeFile(resolve(values.out), `${text}\n`)
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${text}\n\`\`\`\n`)

  if (values.post) {
    const webhook = process.env.DIGEST_WEBHOOK_URL
    if (!webhook) throw new Error('--post exige o secret DIGEST_WEBHOOK_URL.')
    await postDigest(webhook, text)
    console.log('Resumo enviado ao canal.')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
