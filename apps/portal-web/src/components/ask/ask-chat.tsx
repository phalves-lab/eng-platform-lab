'use client'

import type { AskResponse } from '@lab/contracts'
import { ArrowUp, BookOpen, Sparkles } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cleanSnippet, shortSource } from '@/lib/labels'

interface Turn {
  question: string
  response: AskResponse | null
  error: string | null
}

const SUGGESTIONS = [
  'Qual o padrão de nome de branch?',
  'O que diz o ENG-QA-01?',
  'Quantas aprovações um PR precisa?',
  'Como o bot de review funciona?',
]

export function AskChat() {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)

  const ask = async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length < 3 || loading) return
    setLoading(true)
    setQuestion('')
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })
      const body = (await response.json()) as AskResponse | { error: string }
      setTurns((current) => [
        ...current,
        'error' in body
          ? { question: trimmed, response: null, error: body.error }
          : { question: trimmed, response: body, error: null },
      ])
    } catch {
      setTurns((current) => [
        ...current,
        { question: trimmed, response: null, error: 'Falha de rede. Tente de novo.' },
      ])
    } finally {
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
          Modo busca: as respostas trazem os trechos mais relevantes do handbook com a fonte. A
          resposta escrita por IA entra quando o gateway corporativo de modelos estiver ligado.
        </p>
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugestões">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              onClick={() => void ask(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      <ol className="space-y-6" aria-live="polite">
        {turns.map((turn, index) => (
          <li key={index} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {turn.question}
            </div>
            <Card className="gap-3 py-4">
              <CardContent className="space-y-3 px-4">
                {turn.error ? (
                  <p className="text-sm text-destructive">{turn.error}</p>
                ) : (
                  <>
                    <p className="text-sm">{turn.response?.answer}</p>
                    <ul className="space-y-2">
                      {turn.response?.sources.map((source) => (
                        <li key={source.source} className="rounded-lg border bg-muted/40 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <BookOpen className="size-3.5 text-primary" aria-hidden />
                            <Badge variant="outline" className="font-normal">
                              {shortSource(source.source)}
                            </Badge>
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {cleanSnippet(source.snippet)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
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
        <Button
          type="submit"
          size="icon"
          disabled={loading || question.trim().length < 3}
          aria-label="Enviar pergunta"
        >
          <ArrowUp aria-hidden />
        </Button>
      </form>
    </div>
  )
}
