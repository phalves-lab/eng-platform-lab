'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CopyBlockProps {
  readonly code: string
  readonly label: string
  readonly caption?: string | null
  readonly className?: string
  readonly wrap?: boolean
}

type CopyState = 'idle' | 'copied' | 'failed'

const STATE_LABEL: Record<CopyState, string> = {
  idle: 'Copiar',
  copied: 'Copiado',
  failed: 'Selecione e copie',
}

export function CopyBlock({ code, label, caption, className, wrap = false }: CopyBlockProps) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => setState('copied'))
      .catch(() => setState('failed'))
  }

  return (
    <figure className={cn('overflow-hidden rounded-lg border bg-muted/40', className)}>
      <figcaption className="flex items-center gap-2 border-b bg-muted/60 py-1.5 pr-1.5 pl-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {caption ? (
          <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {caption}
          </code>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
          aria-label={`${STATE_LABEL[state]}: ${label}`}
        >
          {state === 'copied' ? (
            <Check className="size-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {STATE_LABEL[state]}
        </Button>
        <span className="sr-only" aria-live="polite">
          {state === 'idle' ? '' : STATE_LABEL[state]}
        </span>
      </figcaption>
      <pre
        className={cn(
          'overflow-x-auto p-3 font-mono text-xs leading-relaxed',
          wrap && 'whitespace-pre-wrap wrap-break-word',
        )}
      >
        <code>{code}</code>
      </pre>
    </figure>
  )
}
