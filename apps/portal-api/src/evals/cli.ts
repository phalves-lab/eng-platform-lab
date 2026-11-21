import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { AskService } from '../ask/ask.service.js'
import { ChatService } from '../ask/chat.service.js'
import type { ModelProvider } from '../ask/model/model-provider.js'
import { OpenAICompatibleProvider } from '../ask/model/openai-compatible.provider.js'
import { loadSystemPrompt } from '../ask/system-prompt.js'
import type { PortalConfig } from '../config/config.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { GOLDEN_SET_DIR, loadGoldenSet } from './golden-set.js'
import { MeteredProvider } from './metered-provider.js'
import { summarize, toMarkdown } from './report.js'
import { runGoldenSet } from './runner.js'
import { ScriptedProvider } from './scripted-provider.js'

const HANDBOOK_DIR = fileURLToPath(new URL('../../../../handbook', import.meta.url))

const USAGE =
  'Uso: npm run chat-evals -- [--offline] [--cases <pasta>] [--handbook <pasta>] [--only <id,id>] [--min <0-1>] [--json <arquivo>] [--summary <arquivo>]\n'

const ModelEnvSchema = z.object({
  PORTAL_LLM_BASE_URL: z.url(),
  PORTAL_LLM_API_KEY: z.string().min(1),
  PORTAL_LLM_MODEL: z.string().min(1),
  PORTAL_LLM_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(60_000),
  PORTAL_LLM_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(8).default(4),
})

const MinimumSchema = z.coerce.number().min(0).max(1)

export interface CliIo {
  env: NodeJS.ProcessEnv
  stdout: (text: string) => void
  fetchImpl?: typeof fetch
}

type ModelSetup = { provider: ModelProvider; llm: PortalConfig['llm'] }

const modelSetup = (env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): ModelSetup | null => {
  const parsed = ModelEnvSchema.safeParse(env)
  if (!parsed.success) return null
  const value = parsed.data
  const llm = {
    baseUrl: value.PORTAL_LLM_BASE_URL.replace(/\/$/, ''),
    apiKey: value.PORTAL_LLM_API_KEY,
    model: value.PORTAL_LLM_MODEL,
    timeoutMs: value.PORTAL_LLM_TIMEOUT_MS,
    maxToolRounds: value.PORTAL_LLM_MAX_TOOL_ROUNDS,
  }
  const provider = new OpenAICompatibleProvider({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  return { provider, llm }
}

const write = async (path: string, content: string) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

/**
 * Runs the chat golden set through the real `ChatService` and returns the exit code: 0 when the
 * pass rate reaches `--min`, 1 below it and 2 on usage errors. `--offline` swaps the model for
 * the scripted answers stored in each case; otherwise the `PORTAL_LLM_*` variables pick the model.
 */
export const runChatEvals = async (argv: string[], io: CliIo): Promise<number> => {
  const { values } = parseArgs({
    args: argv,
    options: {
      offline: { type: 'boolean', default: false },
      cases: { type: 'string', default: GOLDEN_SET_DIR },
      handbook: { type: 'string', default: HANDBOOK_DIR },
      only: { type: 'string' },
      min: { type: 'string', default: '0' },
      json: { type: 'string' },
      summary: { type: 'string' },
    },
  })
  const minimum = MinimumSchema.safeParse(values.min)
  if (!minimum.success) {
    io.stdout(`--min precisa ser um número entre 0 e 1.\n${USAGE}`)
    return 2
  }
  const scripted = new ScriptedProvider()
  const setup: ModelSetup | null = values.offline
    ? { provider: scripted, llm: null }
    : modelSetup(io.env, io.fetchImpl)
  if (!setup) {
    io.stdout(
      `Defina PORTAL_LLM_BASE_URL, PORTAL_LLM_API_KEY e PORTAL_LLM_MODEL ou rode com --offline.\n${USAGE}`,
    )
    return 2
  }

  const cwd = io.env.INIT_CWD ?? process.cwd()
  const only = new Set(values.only?.split(',').map((id) => id.trim()) ?? [])
  const cases = (await loadGoldenSet(resolve(cwd, values.cases))).filter(
    (golden) => !only.size || only.has(golden.id),
  )
  const handbook = new HandbookService({ handbookDir: resolve(cwd, values.handbook) })
  await handbook.onModuleInit()
  const metered = new MeteredProvider(setup.provider)
  const chat = new ChatService(
    handbook,
    new AskService(handbook),
    metered,
    { llm: setup.llm },
    await loadSystemPrompt(),
  )

  const results = await runGoldenSet({
    cases,
    chat,
    metered,
    prepare: (golden) => scripted.use(golden.offline),
  })
  const report = summarize({
    model: setup.provider.model,
    offline: values.offline,
    minimum: minimum.data,
    results,
  })
  const markdown = toMarkdown(report)
  io.stdout(markdown)
  if (values.json) await write(resolve(cwd, values.json), `${JSON.stringify(report, null, 2)}\n`)
  if (values.summary) await write(resolve(cwd, values.summary), markdown)
  return report.rate >= report.minimum && report.total > 0 ? 0 : 1
}
