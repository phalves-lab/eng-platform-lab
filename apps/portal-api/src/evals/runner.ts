import type { AskResponse } from '@lab/contracts'
import type { ChatService } from '../ask/chat.service.js'
import { type CaseResult, evaluateCase } from './checks.js'
import type { GoldenCase } from './golden-set.js'
import type { MeteredProvider } from './metered-provider.js'

export interface RunOptions {
  cases: GoldenCase[]
  chat: Pick<ChatService, 'answer'>
  metered: MeteredProvider
  /** Runs before each question, for example to load the offline script of the case. */
  prepare?: (golden: GoldenCase) => void
  clock?: () => number
}

/** Asks every golden question in order, one at a time, and scores each answer. */
export const runGoldenSet = async ({
  cases,
  chat,
  metered,
  prepare,
  clock = () => performance.now(),
}: RunOptions): Promise<CaseResult[]> => {
  const results: CaseResult[] = []
  for (const golden of cases) {
    prepare?.(golden)
    metered.reset()
    const tools: string[] = []
    let response: AskResponse | null = null
    let error: string | null = null
    const started = clock()
    try {
      response = await chat.answer(
        golden.question,
        (event) => {
          if (event.type === 'tool') tools.push(event.name)
        },
        new AbortController().signal,
        [],
        golden.mode,
      )
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure)
    }
    const latencyMs = Math.max(0, Math.round(clock() - started))
    results.push(evaluateCase(golden, { response, tools, latencyMs, error, ...metered.snapshot() }))
  }
  return results
}
