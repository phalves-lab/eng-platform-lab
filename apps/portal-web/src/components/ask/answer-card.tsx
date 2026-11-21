import type { AskMode, Citation, SearchHit } from '@lab/contracts'
import {
  AlertCircle,
  BookOpen,
  CircleSlash,
  FileText,
  LoaderCircle,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Turn } from '@/lib/ask-stream'
import { DRAFT_NOTICE, copyableDraft } from '@/lib/chat-modes'
import { TOOL_LABEL, citationHref } from '@/lib/citations'
import { cleanSnippet, shortSource } from '@/lib/labels'
import { CopyDraftButton } from './copy-draft-button'

function ModeBadge({
  mode,
  pending,
  draft,
}: {
  readonly mode: AskMode | null
  readonly pending: boolean
  readonly draft: boolean
}) {
  if (mode === 'llm' && draft) {
    return (
      <Badge variant="warning" title="Rascunho escrito pela IA para você revisar e copiar">
        <FileText aria-hidden />
        Rascunho
      </Badge>
    )
  }
  if (mode === 'llm') {
    return (
      <Badge variant="info" title="Resposta escrita pela IA a partir do handbook">
        <Sparkles aria-hidden />
        IA
      </Badge>
    )
  }
  if (mode === 'retrieval') {
    return (
      <Badge variant="secondary" title="Trechos do handbook encontrados pela busca">
        <Search aria-hidden />
        Busca
      </Badge>
    )
  }
  return pending ? <Skeleton className="h-5 w-12 rounded-full" /> : <span />
}

function Progress({ turn }: { readonly turn: Turn }) {
  if (turn.status === 'cancelled') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleSlash className="size-3.5" aria-hidden />
        Resposta interrompida
      </span>
    )
  }
  if (turn.status !== 'streaming') return null
  const tool = turn.tools.at(-1)
  const label = tool ? `Consultando ${TOOL_LABEL[tool] ?? tool}` : 'Pensando'
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
      <span className="truncate">{turn.text ? 'Escrevendo' : label}</span>
    </span>
  )
}

function CitationChip({ citation }: { readonly citation: Citation }) {
  const href = citationHref(citation)
  const content = (
    <>
      <BookOpen className="text-primary" aria-hidden />
      <span className="truncate">{citation.label}</span>
    </>
  )
  if (!href) {
    return (
      <Badge variant="outline" className="max-w-full font-normal" title={citation.source}>
        {content}
      </Badge>
    )
  }
  return (
    <Badge asChild variant="outline" className="max-w-full font-normal">
      <Link href={href} title={citation.source}>
        {content}
      </Link>
    </Badge>
  )
}

function Citations({ citations }: { readonly citations: Citation[] }) {
  if (!citations.length) return null
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Fontes</p>
      <ul className="flex flex-wrap gap-2">
        {citations.map((citation) => (
          <li key={`${citation.kind}:${citation.ref}`} className="max-w-full">
            <CitationChip citation={citation} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Passages({ sources }: { readonly sources: SearchHit[] }) {
  if (!sources.length) return null
  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={source.source} className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden />
            <Badge variant="outline" className="max-w-full min-w-0 shrink font-normal">
              <span className="truncate">{shortSource(source.source)}</span>
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {cleanSnippet(source.snippet)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function AnswerText({ text, streaming }: { readonly text: string; readonly streaming: boolean }) {
  if (!text && !streaming) return null
  if (!text) {
    return (
      <div className="space-y-2" aria-label="Carregando resposta">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-8/12" />
      </div>
    )
  }
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" aria-live="polite">
      {text}
      {streaming ? (
        <span
          className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-primary/70"
          aria-hidden
        />
      ) : null}
    </p>
  )
}

function DraftFooter({ text }: { readonly text: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning-light p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-warning-dark">{DRAFT_NOTICE}</p>
      <div className="shrink-0">
        <CopyDraftButton text={text} />
      </div>
    </div>
  )
}

/**
 * One answer in the conversation: mode, streamed text, sources and error or retry. In a draft
 * mode a finished answer also gets the draft notice and the copy button.
 */
export function AnswerCard({
  turn,
  onRetry,
  canRetry,
  draft = false,
}: {
  readonly turn: Turn
  readonly onRetry: () => void
  readonly canRetry: boolean
  readonly draft?: boolean
}) {
  const streaming = turn.status === 'streaming'
  const response = turn.response
  const copyable = draft ? copyableDraft(turn) : null
  return (
    <Card className="gap-3 py-4" aria-busy={streaming}>
      <CardContent className="space-y-3 px-4">
        {turn.mode || streaming || turn.status === 'cancelled' ? (
          <div className="flex items-center justify-between gap-3">
            <ModeBadge mode={turn.mode} pending={streaming} draft={draft} />
            <Progress turn={turn} />
          </div>
        ) : null}

        <AnswerText text={turn.text} streaming={streaming} />

        {turn.error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive-light p-3">
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {turn.error}
            </p>
            <Button variant="outline" size="sm" onClick={onRetry} disabled={!canRetry}>
              <RotateCcw aria-hidden />
              Tentar de novo
            </Button>
          </div>
        ) : null}

        {turn.status === 'cancelled' ? (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={onRetry}
            disabled={!canRetry}
          >
            <RotateCcw aria-hidden />
            Perguntar de novo
          </Button>
        ) : null}

        {copyable ? <DraftFooter text={copyable} /> : null}

        {response?.mode === 'llm' ? <Citations citations={response.citations} /> : null}
        {response?.mode === 'retrieval' ? <Passages sources={response.sources} /> : null}
      </CardContent>
    </Card>
  )
}
