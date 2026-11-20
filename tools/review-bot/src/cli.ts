import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { DataBoundaryError, assertDataBoundary } from './boundary.js'
import {
  filesFromPatch,
  loadEvalCases,
  renderResults,
  scoreCase,
  summarize,
  type CaseResult,
} from './evals.js'
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
  computeSignal,
  renderComment,
  type ReviewContext,
} from './review.js'
import { ConfluenceDocSource, JiraTaskSource } from './sources/atlassian.js'
import { FixtureDocSource, FixtureTaskSource } from './sources/fixtures.js'
import { findPage, findTask } from './sources/fallback.js'
import { extractTaskKey } from './sources/text.js'
import type { DocPage, DocSource, TaskSource } from './sources/types.js'

const isCI = process.env.CI === 'true'

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ${name} não definida.`)
  return value
}

const geminiFromEnv = () =>
  new GeminiProvider({
    apiKey: requireEnv('GEMINI_API_KEY'),
    model: requireEnv('GEMINI_MODEL'),
    ...(process.env.GEMINI_TIMEOUT_MS ? { timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) } : {}),
  })

const atlassianOptions = () => ({
  site: requireEnv('ATLASSIAN_SITE'),
  email: requireEnv('ATLASSIAN_EMAIL'),
  apiToken: requireEnv('ATLASSIAN_API_TOKEN'),
  ...(process.env.JIRA_ACCEPTANCE_FIELD
    ? { acceptanceField: process.env.JIRA_ACCEPTANCE_FIELD }
    : {}),
})

/**
 * Monta as fontes de contexto em ordem de consulta. Com fixtures, a task vem primeiro da base
 * (confiável) e, se não existir lá, do próprio PR; a documentação vem primeiro do PR, porque é a
 * versão que vai ser mergeada junto com o código.
 */
const buildSources = (
  source: string,
  configDir: string,
  repoDir: string,
): { tasks: TaskSource[]; docs: DocSource[] } => {
  if (source === 'atlassian') {
    if (isCI) throw new Error('A fonte atlassian só roda localmente. No CI use --source fixtures.')
    const options = atlassianOptions()
    return { tasks: [new JiraTaskSource(options)], docs: [new ConfluenceDocSource(options)] }
  }
  if (source === 'fixtures') {
    return {
      tasks: [
        new FixtureTaskSource(join(configDir, 'fixtures/jira'), 'base'),
        new FixtureTaskSource(join(repoDir, 'fixtures/jira'), 'pr'),
      ],
      docs: [
        new FixtureDocSource(join(repoDir, 'fixtures/confluence'), 'pr'),
        new FixtureDocSource(join(configDir, 'fixtures/confluence'), 'base'),
      ],
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
  assertDataBoundary({
    confidential: values.source === 'atlassian',
    dryRun: values['dry-run'],
    provider: 'lab',
  })
  const repoDir = resolve(values['repo-dir'])
  const configDir = resolve(values['config-dir'])
  const { tasks, docs } = buildSources(values.source, configDir, repoDir)

  const diff = collectDiff(repoDir, values.base, values.head, 60_000)
  const catalog = await loadCatalog(join(configDir, 'catalog/modules'))
  const riskRules = riskLabelsForFiles(
    await loadRiskRules(join(configDir, 'policy/risk-rules.yaml')),
    diff.files,
  )
  const modules = modulesForFiles(catalog, diff.files)
  const uncataloged = filesOutsideCatalog(catalog, diff.files)
  const taskKey = values.task ?? extractTaskKey(values.branch, values.title)
  const foundTask = taskKey ? await findTask(tasks, taskKey) : null

  const pages: DocPage[] = []
  for (const module of modules) {
    if (!module.confluencePageId) continue
    const page = await findPage(docs, module.confluencePageId)
    if (page) pages.push(page.value)
  }

  const context: ReviewContext = {
    task: foundTask?.value ?? null,
    taskOrigin: foundTask?.origin ?? null,
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

  const provider = geminiFromEnv()
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
  const dir = resolve(values['config-dir'])
  const { tasks } = buildSources(values.source, dir, dir)
  console.log(JSON.stringify((await findTask(tasks, key))?.value ?? null, null, 2))
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

const runHygieneLocal = async (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string', default: 'origin/develop' },
      'base-ref': { type: 'string', default: 'develop' },
      title: { type: 'string' },
      'body-file': { type: 'string' },
      'repo-dir': { type: 'string', default: '.' },
    },
  })
  const repoDir = resolve(values['repo-dir'])
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
  const headRef = git(['branch', '--show-current'])
  const title =
    values.title ??
    git(['log', '--reverse', '--format=%s', `${values.base}..HEAD`]).split('\n')[0] ??
    ''
  const body = values['body-file'] ? await readFile(resolve(values['body-file']), 'utf8') : null
  const files = git(['diff', '--name-only', `${values.base}...HEAD`])
    .split('\n')
    .filter(Boolean)

  const issues = checkHygiene({
    title,
    body: body ?? '',
    headRef,
    baseRef: values['base-ref'],
    files,
  }).filter((issue) => body !== null || !['RN-11', 'RN-27'].includes(issue.rule))

  console.log(`Branch: ${headRef}`)
  console.log(`Título considerado: ${title || '(sem commits na branch)'}`)
  if (body === null) {
    console.log('Sem --body-file: corpo do PR (task, seções, SQL e ENV) será checado no CI.')
  }
  if (issues.length === 0) {
    console.log('Higiene local ok.')
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

const runEval = async (argv: string[]) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      'cases-dir': { type: 'string', default: 'review/evals/cases' },
      'config-dir': { type: 'string', default: '.' },
      'dry-run': { type: 'boolean', default: false },
      min: { type: 'string', default: '0.8' },
    },
  })
  const configDir = resolve(values['config-dir'])
  const cases = await loadEvalCases(resolve(configDir, values['cases-dir']))
  const catalog = await loadCatalog(join(configDir, 'catalog/modules'))
  const allRiskRules = await loadRiskRules(join(configDir, 'policy/risk-rules.yaml'))
  const rubric = await readFile(join(configDir, 'review/rubric.md'), 'utf8')
  const agentsGuide = await readOptional(join(configDir, 'AGENTS.md'))
  const template = await readFile(join(configDir, 'review/prompts/review.md'), 'utf8')
  const verifyTemplate = await readFile(join(configDir, 'review/prompts/verify.md'), 'utf8')
  const provider = values['dry-run'] ? null : geminiFromEnv()

  const results: CaseResult[] = []
  const skipped: string[] = []
  for (const evalCase of cases) {
    const files = filesFromPatch(evalCase.patch)
    const context: ReviewContext = {
      task: evalCase.task,
      taskOrigin: 'caso',
      taskKey: evalCase.task?.key ?? null,
      modules: modulesForFiles(catalog, files),
      uncataloged: filesOutsideCatalog(catalog, files),
      docs: [],
      riskRules: riskLabelsForFiles(allRiskRules, files),
      files,
      patch: evalCase.patch,
      agentsGuide,
      rubric,
    }
    const prompt = buildPrompt(template, context)

    if (!provider) {
      const expectations = evalCase.expect.findings.length + evalCase.expect.acceptance.length
      console.log(
        `${evalCase.id}: ${files.length} arquivo(s), prompt com ${prompt.length} caracteres, ${expectations} expectativa(s)${evalCase.confidential ? ', confidencial' : ''}.`,
      )
      continue
    }
    try {
      assertDataBoundary({ confidential: evalCase.confidential, dryRun: false, provider: 'lab' })
    } catch (error) {
      if (!(error instanceof DataBoundaryError)) throw error
      skipped.push(evalCase.id)
      continue
    }
    const { review } = await applyVerification(await provider.review(prompt), (finding) =>
      provider.verify(buildVerificationPrompt(verifyTemplate, finding, context)),
    )
    results.push(scoreCase(evalCase, review, computeSignal(review, context)))
  }

  if (!provider) {
    console.log(`${cases.length} caso(s) válido(s).`)
    return
  }
  console.log(renderResults(results, skipped))
  if (summarize(results).rate < Number(values.min)) process.exitCode = 1
}

const commands: Record<string, (argv: string[]) => Promise<void>> = {
  review: runReview,
  task: runTask,
  hygiene: () => runHygiene(),
  'hygiene-local': runHygieneLocal,
  propose: runPropose,
  eval: runEval,
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
