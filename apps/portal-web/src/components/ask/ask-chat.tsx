'use client'

import type { ChatMode, ChatStreamEvent, ConversationSummary } from '@lab/contracts'
import { ArrowUp, FileText, Sparkles, Square } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { applyEvent, finishTurn, newTurn, readAskStream, type Turn } from '@/lib/ask-stream'
import { chatRequestBody } from '@/lib/chat-modes'
import { AnswerCard } from './answer-card'

const ASK_INTRO =
  'As respostas usam só o handbook e mostram de onde vieram. O selo de cada resposta diz se ela foi escrita pela IA ou montada pela busca, que entra quando o modelo não está ligado. A conversa fica no seu histórico, visível só para você, com e-mail, CPF, telefone, cartão e RA mascarados.'

const DRAFT_INTRO =
  'Neste modo a IA escreve um rascunho para você revisar e copiar. Nada é gravado no Jira, no GitHub ou no handbook. O texto colado sai com e-mail, CPF, telefone, cartão e RA mascarados, e a conversa fica no seu histórico, visível só para você. Ctrl Enter envia.'

const UNAVAILABLE =
  'Este modo precisa do modelo de IA, que não está ligado neste ambiente. Use o modo Perguntar.'

const errorFor = (status: number, body: unknown) => {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return status === 429
    ? 'Muitas perguntas em pouco tempo. Espere um minuto e tente de novo.'
    : 'Não foi possível consultar o handbook agora.'
}

interface AskChatProps {
  readonly mode: ChatMode
  readonly conversationId: string | null
  readonly initialTurns: Turn[]
  readonly onSaved: (conversation: ConversationSummary) => void
}

/**
 * The chat of one conversation in one mode; a new conversation starts empty and gets its id
 * once saved. Draft modes take longer pasted text, so Enter breaks the line and Ctrl Enter sends.
 */
export function AskChat({ mode, conversationId, initialTurns, onSaved }: AskChatProps) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>(initialTurns)
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const nextId = useRef(initialTurns.length)
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns.length])

  const update = useCallback((id: number, change: (turn: Turn) => Turn) => {
    setTurns((current) => current.map((turn) => (turn.id === id ? change(turn) : turn)))
  }, [])

  const ask = async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length < 3 || loading || !mode.available) return
    const id = nextId.current++
    const aborter = new AbortController()
    controller.current = aborter
    setLoading(true)
    setQuestion('')
    setTurns((current) => [...current, newTurn(id, trimmed)])
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(chatRequestBody(trimmed, mode.id, conversationId)),
        signal: aborter.signal,
      })
      if (!response.ok || !response.body) {
        const body: unknown = await response.json().catch(() => null)
        update(id, (turn) => ({ ...turn, error: errorFor(response.status, body), status: 'error' }))
        return
      }
      await readAskStream(response.body, (event: ChatStreamEvent) => {
        if (event.type === 'conversation') onSaved(event.conversation)
        else update(id, (turn) => applyEvent(turn, event))
      })
      update(id, finishTurn)
    } catch {
      update(id, (turn) =>
        aborter.signal.aborted
          ? { ...turn, status: 'cancelled' }
          : { ...turn, error: 'Falha de rede. Tente de novo.', status: 'error' },
      )
    } finally {
      controller.current = null
      setLoading(false)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void ask(question)
  }

  return (
    <div className="space-y-6">
      {mode.draft ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-light p-4 text-sm text-warning-dark">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{mode.available ? DRAFT_INTRO : UNAVAILABLE}</p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-light p-4 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>{ASK_INTRO}</p>
        </div>
      )}

      {turns.length === 0 && mode.available ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões">
          {mode.examples.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal text-left break-words"
              onClick={() => void ask(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      <ol ref={list} className="space-y-6">
        {turns.map((turn) => (
          <li key={turn.id} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground">
              {turn.question}
            </div>
            <AnswerCard
              turn={turn}
              onRetry={() => void ask(turn.question)}
              canRetry={!loading}
              draft={mode.draft}
            />
          </li>
        ))}
      </ol>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm"
      >
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            if (mode.draft && !event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            void ask(question)
          }}
          placeholder={mode.placeholder}
          aria-label={mode.draft ? 'Texto para o rascunho' : 'Sua pergunta'}
          rows={mode.draft ? 4 : 1}
          maxLength={mode.maxLength}
          disabled={!mode.available}
          className="min-h-10 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        {loading ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => controller.current?.abort()}
            aria-label="Parar resposta"
          >
            <Square className="fill-current" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={question.trim().length < 3 || !mode.available}
            aria-label={mode.draft ? 'Gerar rascunho' : 'Enviar pergunta'}
          >
            <ArrowUp aria-hidden />
          </Button>
        )}
      </form>
    </div>
  )
}
