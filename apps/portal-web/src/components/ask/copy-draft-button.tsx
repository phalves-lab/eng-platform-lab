'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type CopyState = 'idle' | 'copied' | 'failed'

const LABEL: Record<CopyState, string> = {
  idle: 'Copiar rascunho',
  copied: 'Copiado',
  failed: 'Selecione e copie',
}

export function CopyDraftButton({ text }: { readonly text: string }) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => setState('copied'))
      .catch(() => setState('failed'))
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {state === 'copied' ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
        {LABEL[state]}
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === 'idle' ? '' : LABEL[state]}
      </span>
    </>
  )
}
