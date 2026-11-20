import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { decideWrite, describePlan, executeWritePlan, type WritePlan } from './atlassian-write.js'
import {
  filesOutsideCatalog,
  loadCatalog,
  loadRiskRules,
  modulesForFiles,
  riskLabelsForFiles,
} from './catalog.js'
import { collectDiff } from './diff.js'
import { listPullFiles, upsertStickyComment } from './github.js'
import { GeminiProvider } from './llm/gemini.js'
import { checkHygiene } from './pr-hygiene.js'
import {
  applyVerification,
  buildPrompt,
  buildVerificationPrompt,
  renderComment,
  type ReviewContext,
} from './review.js'
import { ConfluenceDocSource, JiraTaskSource } from './sources/atlassian.js'
import { FixtureDocSource, FixtureTaskSource } from './sources/fixtures.js'
import { extractTaskKey } from './sources/text.js'
import type { DocPage, DocSource, TaskSource } from './sources/types.js'

const isCI = process.env.CI === 'true'

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ${name} não definida.`)
  return value
}

const atlassianOptions = () => ({
  site: requireEnv('ATLASSIAN_SITE'),
  email: requireEnv('ATLASSIAN_EMAIL'),
  apiToken: requireEnv('ATLASSIAN_API_TOKEN'),
  ...(process.env.JIRA_ACCEPTANCE_FIELD
    ? { acceptanceField: process.env.JIRA_ACCEPTANCE_FIELD }
    : {}),
})

const buildSources = (
  source: string,
  configDir: string,
): { tasks: TaskSource; docs: DocSource } => {
  if (source === 'atlassian') {
    if (isCI) throw new Error('A fonte atlassian só roda localmente. No CI use --source fixtures.')
    const options = atlassianOptions()
    return { tasks: new JiraTaskSource(options), docs: new ConfluenceDocSource(options) }
  }
  if (source === 'fixtures') {
    return {
      tasks: new FixtureTaskSource(join(configDir, 'fixtures/jira')),
      docs: new FixtureDocSource(join(configDir, 'fixtures/confluence')),
    }
  }
  throw new Error(`Fonte desconhecida: ${source}. Use fixtures ou atlassian.`)
}

const readOptional = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

const promptVersion = (template: string): string =>
  /<!--\s*version:\s*([\w.-]+)\s*-->/.exec(template)?.[1] ?? 'sem-versão'

const runReview = async (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      'repo-dir': { type: 'string', default: '.' },
      'config-dir': { type: 'string', default: '.' },
      base: { type: 'string', default: 'origin/main' },
      head: { type: 'string', default: 'HEAD' },
      branch: { type: 'string' },
      title: { type: 'string' },
      task: { type: 'string' },
      source: { type: 'string', default: 'fixtures' },
      'dry-run': { type: 'boolean', default: false },
      post: { type: 'boolean', default: false },
      pr: { type: 'string' },
      out: { type: 'string' },
    },
  })
  const repoDir = resolve(values['repo-dir'])
  const configDir = resolve(values['config-dir'])
  const { tasks, docs } = buildSources(values.source, configDir)

  const diff = collectDiff(repoDir, values.base, values.head, 60_000)
  const catalog = await loadCatalog(join(configDir, 'catalog/modules'))
  const riskRules = riskLabelsForFiles(
    await loadRiskRules(join(configDir, 'policy/risk-rules.yaml')),
    diff.files,
  )
  const modules = modulesForFiles(catalog, diff.files)
  const uncataloged = filesOutsideCatalog(catalog, diff.files)
  const taskKey = values.task ?? extractTaskKey(values.branch, values.title)
  const task = taskKey ? await tasks.getTask(taskKey) : null

  const pages: DocPage[] = []
  for (const module of modules) {
    if (!module.confluencePageId) continue
    const page = await docs.getPage(module.confluencePageId)
    if (page) pages.push(page)
  }

  const context: ReviewContext = {
    task,
    taskKey,
    modules,
    uncataloged,
    docs: pages,
    riskRules,
    files: diff.files,
    patch: diff.patch,
    agentsGuide: await readOptional(join(repoDir, 'AGENTS.md')),
    rubric: await readFile(join(configDir, 'review/rubric.md'), 'utf8'),
  }
  const template = await readFile(join(configDir, 'review/prompts/review.md'), 'utf8')
  const prompt = buildPrompt(template, context)

  if (values['dry-run']) {
    console.log(prompt)
    return
  }

  const provider = new GeminiProvider({
    apiKey: requireEnv('GEMINI_API_KEY'),
    model: requireEnv('GEMINI_MODEL'),
  })
  const verifyTemplate = await readFile(join(configDir, 'review/prompts/verify.md'), 'utf8')
  const { review, refuted } = await applyVerification(await provider.review(prompt), (finding) =>
    provider.verify(buildVerificationPrompt(verifyTemplate, finding, context)),
  )
  const comment = renderComment(review, context, {
    model: provider.model,
    promptVersion: promptVersion(template),
    refuted: refuted.length,
  })

  if (values.out) await writeFile(values.out, comment)
  if (values.post) {
    if (!values.pr) throw new Error('--post exige --pr.')
    const result = await upsertStickyComment(
      { token: requireEnv('GITHUB_TOKEN'), repository: requireEnv('GITHUB_REPOSITORY') },
      Number(values.pr),
      comment,
    )
    console.log(`Comentário ${result === 'created' ? 'criado' : 'atualizado'} no PR #${values.pr}.`)
    return
  }
  console.log(comment)
}

const runTask = async (argv: string[]) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      source: { type: 'string', default: 'atlassian' },
      'config-dir': { type: 'string', default: '.' },
    },
  })
  const key = positionals[0]
  if (!key) throw new Error('Informe a chave da task, ex.: task ABC-1234.')
  const { tasks } = buildSources(values.source, resolve(values['config-dir']))
  console.log(JSON.stringify(await tasks.getTask(key), null, 2))
}

const runHygiene = async () => {
  const event = JSON.parse(await readFile(requireEnv('GITHUB_EVENT_PATH'), 'utf8')) as {
    pull_request?: {
      number: number
      title: string
      body: string | null
      head: { ref: string }
      base: { ref: string }
    }
  }
  if (!event.pull_request) {
    console.log('Evento sem pull request; nada a checar.')
    return
  }
  const files = await listPullFiles(
    { token: requireEnv('GITHUB_TOKEN'), repository: requireEnv('GITHUB_REPOSITORY') },
    event.pull_request.number,
  )
  const issues = checkHygiene({
    title: event.pull_request.title,
    body: event.pull_request.body ?? '',
    headRef: event.pull_request.head.ref,
    baseRef: event.pull_request.base.ref,
    files,
  })
  if (issues.length === 0) {
    console.log('Higiene do PR ok.')
    return
  }
  for (const issue of issues) console.error(`[${issue.rule}] ${issue.message}`)
  process.exitCode = 1
}

const runPropose = async (argv: string[]) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'body-file': { type: 'string' },
      title: { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  })
  const [kind, target] = positionals
  if (!kind || !target || !values['body-file']) {
    throw new Error(
      'Uso: propose <jira-comment|confluence-update> <alvo> --body-file <arquivo> [--title] [--confirm]',
    )
  }
  const body = await readFile(values['body-file'], 'utf8')
  let plan: WritePlan
  if (kind === 'jira-comment') {
    plan = { kind, target, body }
  } else if (kind === 'confluence-update') {
    if (!values.title) throw new Error('confluence-update exige --title.')
    plan = { kind, target, title: values.title, storageBody: body }
  } else {
    throw new Error(`Tipo de escrita desconhecido: ${kind}.`)
  }

  console.log(describePlan(plan))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const decision = await decideWrite(plan, {
      confirmFlag: values.confirm,
      isTTY: Boolean(process.stdin.isTTY),
      isCI,
      ask: (question) => rl.question(question),
    })
    if (!decision.execute) {
      const reasons = {
        'dry-run': 'Simulação: nada foi enviado. Rode de novo com --confirm para executar.',
        ci: 'Escrita no Atlassian bloqueada em CI.',
        'no-tty': 'Escrita exige terminal interativo.',
        'not-confirmed': 'Confirmação não bateu com o alvo. Nada foi enviado.',
      }
      console.log(reasons[decision.reason])
      return
    }
    const result = await executeWritePlan(plan, atlassianOptions())
    console.log(`Escrita executada (HTTP ${result.status}).`)
  } finally {
    rl.close()
  }
}

const commands: Record<string, (argv: string[]) => Promise<void>> = {
  review: runReview,
  task: runTask,
  hygiene: () => runHygiene(),
  propose: runPropose,
}

const [command, ...rest] = process.argv.slice(2)
const handler = command ? commands[command] : undefined
if (!handler) {
  console.error(`Comandos: ${Object.keys(commands).join(', ')}`)
  process.exit(2)
}

handler(rest).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
