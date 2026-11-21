import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type {
  AskResponse,
  AskStreamEvent,
  ChatModeId,
  Citation,
  LlmAskResponse,
} from '@lab/contracts'
import { normalize, uniqueCitations } from '@lab/handbook'
import { CONFIG, type PortalConfig } from '../config/config.js'
import { HandbookService } from '../handbook/handbook.service.js'
import { AskService } from './ask.service.js'
import { CHAT_MODES, type ChatModes, type ModeSetup } from './modes/draft-modes.js'
import {
  type ChatMessage,
  MODEL_PROVIDER,
  type ModelProvider,
  type ToolCall,
} from './model/model-provider.js'
import { maskPersonalData } from './model/personal-data.js'
import { SYSTEM_PROMPT } from './system-prompt.js'
import { type ChatTool, type ToolOutput, handbookChatTools, toSpecs } from './tools/chat-tool.js'

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
const DRAFT_NEEDS_MODEL =
  'Os rascunhos precisam do modelo de IA, que não está ligado neste ambiente. Use o modo Perguntar para consultar o handbook.'
const DRAFT_FAILED = 'O modelo não respondeu agora e o rascunho não foi gerado. Tente de novo.'

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
 * Answers with the chat model when one is configured, letting it call the tools of the chosen
 * mode for a bounded number of rounds. In the ask mode, without a model or when the model fails
 * before writing anything, it falls back to the retrieval answer.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly handbookTools: ChatTool[]

  constructor(
    private readonly handbook: HandbookService,
    private readonly retrieval: AskService,
    @Inject(MODEL_PROVIDER) private readonly provider: ModelProvider | null,
    @Inject(CONFIG) private readonly config: Pick<PortalConfig, 'llm'>,
    @Inject(SYSTEM_PROMPT) private readonly systemPrompt: string,
    @Optional() @Inject(CHAT_MODES) private readonly modes: ChatModes | null = null,
  ) {
    this.handbookTools = handbookChatTools(() => this.handbook.snapshot())
  }

  /**
   * Returns null when the model failed after part of the answer was already streamed. The last
   * past turns go to the model as context; the retrieval fallback ignores them. Draft modes have
   * no retrieval fallback: without the model they answer with a notice instead of a draft.
   */
  async answer(
    question: string,
    emit: Emit,
    signal: AbortSignal,
    history: readonly PastTurn[] = [],
    mode: ChatModeId = 'ask',
  ): Promise<AskResponse | null> {
    const setup = this.setupOf(mode)
    if (!this.provider || !setup) return this.fallback(mode, question, emit, false)

    emit({ type: 'start', mode: 'llm' })
    let streamed = false
    const timeout = AbortSignal.timeout(this.config.llm?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      const response = await this.fromModel(
        this.provider,
        setup,
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
      if (!streamed) return this.fallback(mode, question, emit, true)
      emit({ type: 'error', message: 'O modelo parou no meio da resposta. Tente de novo.' })
      return null
    }
  }

  private setupOf(mode: ChatModeId): ModeSetup | null {
    if (mode === 'ask') return { systemPrompt: this.systemPrompt, tools: this.handbookTools }
    return this.modes?.setup(mode) ?? null
  }

  private fallback(mode: ChatModeId, question: string, emit: Emit, failed: boolean): AskResponse {
    if (mode === 'ask') return this.fromRetrieval(question, emit, failed ? FALLBACK_NOTICE : '')
    const response: AskResponse = {
      mode: 'retrieval',
      answer: failed ? DRAFT_FAILED : DRAFT_NEEDS_MODEL,
      sources: [],
    }
    emit({ type: 'start', mode: 'retrieval' })
    emit({ type: 'done', response })
    return response
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
    setup: ModeSetup,
    question: string,
    history: readonly PastTurn[],
    emit: Emit,
    onFirstDelta: () => void,
    signal: AbortSignal,
  ): Promise<LlmAskResponse> {
    const messages: ChatMessage[] = [
      { role: 'system', content: setup.systemPrompt },
      ...history.slice(-MAX_PAST_TURNS).flatMap(toMessages),
      { role: 'user', content: maskPersonalData(question) },
    ]
    const consulted: Citation[] = []
    const rounds = this.config.llm?.maxToolRounds ?? DEFAULT_TOOL_ROUNDS
    const specs = toSpecs(setup.tools)
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
        tools: allowTools ? specs : [],
        signal,
        onDelta,
      })
      if (!allowTools || !turn.toolCalls.length) break
      messages.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
      for (const call of turn.toolCalls) {
        emit({ type: 'tool', name: call.name })
        const output = await this.runTool(setup.tools, call, signal)
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

  private async runTool(
    tools: readonly ChatTool[],
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<ToolOutput> {
    const tool = tools.find((candidate) => candidate.name === call.name)
    if (!tool) return { text: `A ferramenta ${call.name} não existe.`, citations: [] }
    let args: unknown
    try {
      args = JSON.parse(call.arguments || '{}')
    } catch {
      return { text: `Argumentos inválidos para ${call.name}: envie JSON.`, citations: [] }
    }
    return tool.call(args, signal)
  }
}
