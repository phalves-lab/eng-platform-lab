'use client'

import type { ChatStreamEvent, ConversationSummary } from '@lab/contracts'
import { ArrowUp, Sparkles, Square } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { applyEvent, finishTurn, newTurn, readAskStream, type Turn } from '@/lib/ask-stream'
import { AnswerCard } from './answer-card'

const SUGGESTIONS = [
  'Qual o padrão de nome de branch?',
  'O que diz o ENG-QA-01?',
  'Quantas aprovações um PR precisa?',
  'Como o bot de review funciona?',
]

const errorFor = (status: number, body: unknown) => {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return status === 429
    ? 'Muitas perguntas em pouco tempo. Espere um minuto e tente de novo.'
    : 'Não foi possível consultar o handbook agora.'
}

interface AskChatProps {
  readonly conversationId: string | null
  readonly initialTurns: Turn[]
  readonly onSaved: (conversation: ConversationSummary) => void
}

/** The chat of one conversation; a new conversation starts empty and gets its id once saved. */
export function AskChat({ conversationId, initialTurns, onSaved }: AskChatProps) {
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
    if (trimmed.length < 3 || loading) return
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
        body: JSON.stringify(
          conversationId ? { question: trimmed, conversationId } : { question: trimmed },
        ),
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
      <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-light p-4 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p>
          As respostas usam só o handbook e mostram de onde vieram. O selo de cada resposta diz se
          ela foi escrita pela IA ou montada pela busca, que entra quando o modelo não está ligado.
          A conversa fica no seu histórico, visível só para você, com e-mail, CPF, telefone, cartão
          e RA mascarados.
        </p>
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto min-h-8 whitespace-normal text-left"
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
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm break-words text-primary-foreground">
              {turn.question}
            </div>
            <AnswerCard turn={turn} onRetry={() => void ask(turn.question)} canRetry={!loading} />
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
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask(question)
            }
          }}
          placeholder="Pergunte algo, por exemplo: quem é dono do bot de review?"
          aria-label="Sua pergunta"
          rows={1}
          maxLength={500}
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
            disabled={question.trim().length < 3}
            aria-label="Enviar pergunta"
          >
            <ArrowUp aria-hidden />
          </Button>
        )}
      </form>
    </div>
  )
}
