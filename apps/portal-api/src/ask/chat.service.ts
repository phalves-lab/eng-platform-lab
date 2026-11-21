import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { AskResponse, AskStreamEvent, Citation, LlmAskResponse } from '@lab/contracts'
import { findTool, handbookTools, normalize, uniqueCitations } from '@lab/handbook'
import { z } from 'zod'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { AskService } from './ask.service.js'
import { CHAT_TOOLS, type ChatTool } from './chat-tools.js'
import {
  type ChatMessage,
  MODEL_PROVIDER,
  type ModelProvider,
  type ToolCall,
  type ToolSpec,
} from './model/model-provider.js'
import { maskPersonalData } from './model/personal-data.js'
import { SYSTEM_PROMPT } from './system-prompt.js'

export type Emit = (event: AskStreamEvent) => void

/** An earlier question and answer of the same conversation, already masked. */
export interface PastTurn {
  question: string
  answer: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TOOL_ROUNDS = 4
const MAX_PAST_TURNS = 6
const MAX_CITATIONS = 8
const EMPTY_ANSWER =
  'Não consegui montar uma resposta com o handbook. Reformule a pergunta ou cite um ID de padrão.'
const FALLBACK_NOTICE = 'O modelo não respondeu agora, então mostro os trechos do handbook. '

const toParameters = (input: z.ZodObject): Record<string, unknown> => {
  const schema: Record<string, unknown> = { ...z.toJSONSchema(input) }
  delete schema['$schema']
  return schema
}

const toSpec = (tool: Pick<ChatTool, 'name' | 'description' | 'input'>): ToolSpec => ({
  name: tool.name,
  description: tool.description,
  parameters: toParameters(tool.input),
})

const TOOL_SPECS: ToolSpec[] = handbookTools.map(toSpec)

type ToolOutput = { text: string; citations: Citation[] }

const failureReason = (error: unknown, timedOut: boolean) => {
  if (timedOut) return 'timeout'
  return error instanceof Error ? error.message : 'unknown error'
}

const words = (value: string) =>
  ` ${normalize(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

const mentions = (answer: string, citation: Citation) => {
  const text = words(answer)
  return [citation.ref, citation.label]
    .map(words)
    .some((value) => value.trim().length >= 3 && text.includes(value))
}

const toMessages = (turn: PastTurn): ChatMessage[] => [
  { role: 'user', content: maskPersonalData(turn.question) },
  { role: 'assistant', content: maskPersonalData(turn.answer), toolCalls: [] },
]

/** Keeps the citations the answer mentions; when it mentions none, keeps everything consulted. */
const pickCitations = (answer: string, citations: Citation[]) => {
  const unique = uniqueCitations(citations)
  const mentioned = unique.filter((citation) => mentions(answer, citation))
  return (mentioned.length ? mentioned : unique).slice(0, MAX_CITATIONS)
}

/**
 * Answers with the chat model when one is configured, letting it call the handbook tools for
 * a bounded number of rounds. Without a model, or when the model fails before writing
 * anything, it falls back to the retrieval answer.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    private readonly handbook: HandbookService,
    private readonly retrieval: AskService,
    @Inject(MODEL_PROVIDER) private readonly provider: ModelProvider | null,
    @Inject(CONFIG) private readonly config: Pick<PortalConfig, 'llm'>,
    @Inject(SYSTEM_PROMPT) private readonly systemPrompt: string,
    @Optional() @Inject(CHAT_TOOLS) private readonly portalTools: readonly ChatTool[] = [],
  ) {}

  private get toolSpecs(): ToolSpec[] {
    return [...TOOL_SPECS, ...this.portalTools.map(toSpec)]
  }

  /**
   * Returns null when the model failed after part of the answer was already streamed. The last
   * past turns go to the model as context; the retrieval fallback ignores them.
   */
  async answer(
    question: string,
    emit: Emit,
    signal: AbortSignal,
    history: readonly PastTurn[] = [],
  ): Promise<AskResponse | null> {
    if (!this.provider) return this.fromRetrieval(question, emit, '')

    emit({ type: 'start', mode: 'llm' })
    let streamed = false
    const timeout = AbortSignal.timeout(this.config.llm?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      const response = await this.fromModel(
        this.provider,
        question,
        history,
        emit,
        () => {
          streamed = true
        },
        AbortSignal.any([signal, timeout]),
      )
      emit({ type: 'done', response })
      return response
    } catch (error) {
      if (signal.aborted) throw error
      this.logger.warn(`model answer failed: ${failureReason(error, timeout.aborted)}`)
      if (!streamed) return this.fromRetrieval(question, emit, FALLBACK_NOTICE)
      emit({ type: 'error', message: 'O modelo parou no meio da resposta. Tente de novo.' })
      return null
    }
  }

  private fromRetrieval(question: string, emit: Emit, notice: string): AskResponse {
    const found = this.retrieval.ask(question)
    const response = { ...found, answer: `${notice}${found.answer}` }
    emit({ type: 'start', mode: 'retrieval' })
    emit({ type: 'done', response })
    return response
  }

  private async fromModel(
    provider: ModelProvider,
    question: string,
    history: readonly PastTurn[],
    emit: Emit,
    onFirstDelta: () => void,
    signal: AbortSignal,
  ): Promise<LlmAskResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.slice(-MAX_PAST_TURNS).flatMap(toMessages),
      { role: 'user', content: maskPersonalData(question) },
    ]
    const consulted: Citation[] = []
    const rounds = this.config.llm?.maxToolRounds ?? DEFAULT_TOOL_ROUNDS
    let answer = ''
    const onDelta = (text: string) => {
      onFirstDelta()
      answer += text
      emit({ type: 'delta', text })
    }

    for (let round = 0; round <= rounds; round += 1) {
      const allowTools = round < rounds
      const turn = await provider.complete({
        messages,
        tools: allowTools ? this.toolSpecs : [],
        signal,
        onDelta,
      })
      if (!allowTools || !turn.toolCalls.length) break
      messages.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
      for (const call of turn.toolCalls) {
        emit({ type: 'tool', name: call.name })
        const output = await this.runTool(call)
        consulted.push(...output.citations)
        messages.push({ role: 'tool', toolCallId: call.id, content: output.text })
      }
    }

    const text = answer.trim()
    return {
      mode: 'llm',
      answer: text || EMPTY_ANSWER,
      citations: text ? pickCitations(text, consulted) : [],
    }
  }

  private resolveTool(name: string) {
    const handbookTool = findTool(name)
    if (handbookTool) {
      return {
        input: handbookTool.input,
        run: (args: unknown) =>
          Promise.resolve(handbookTool.execute(this.handbook.snapshot(), args)),
      }
    }
    const portalTool = this.portalTools.find((tool) => tool.name === name)
    return portalTool
      ? { input: portalTool.input, run: (args: unknown) => portalTool.execute(args) }
      : null
  }

  private async runTool(call: ToolCall): Promise<ToolOutput> {
    const tool = this.resolveTool(call.name)
    if (!tool) return { text: `A ferramenta ${call.name} não existe.`, citations: [] }
    let args: unknown
    try {
      args = JSON.parse(call.arguments || '{}')
    } catch {
      return { text: `Argumentos inválidos para ${call.name}: envie JSON.`, citations: [] }
    }
    const parsed = tool.input.safeParse(args)
    if (!parsed.success) {
      return {
        text: `Argumentos inválidos para ${call.name}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        citations: [],
      }
    }
    try {
      return await tool.run(parsed.data)
    } catch (error) {
      this.logger.warn(`tool ${call.name} failed: ${failureReason(error, false)}`)
      return {
        text: `A ferramenta ${call.name} falhou agora. Tente de novo mais tarde.`,
        citations: [],
      }
    }
  }
}
