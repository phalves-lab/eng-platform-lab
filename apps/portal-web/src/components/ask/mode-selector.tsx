'use client'

import { type ChatMode, type ChatModeId, ChatModeIdSchema } from '@lab/contracts'
import { BookOpen, FileText, Puzzle } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ModeSelectorProps {
  readonly modes: readonly ChatMode[]
  readonly mode: ChatMode
  readonly locked: boolean
  readonly onChange: (id: ChatModeId) => void
}

/** Picks what the chat does; switching mode starts a new conversation. */
export function ModeSelector({ modes, mode, locked, onChange }: ModeSelectorProps) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-72">
          <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
            Modo
          </label>
          <Select
            value={mode.id}
            onValueChange={(value) => {
              const parsed = ChatModeIdSchema.safeParse(value)
              if (parsed.success) onChange(parsed.data)
            }}
          >
            <SelectTrigger id={id} className="w-full min-w-0" aria-describedby={hintId}>
              <SelectValue>{mode.label}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-80">
              {modes.map((option) => (
                <SelectItem key={option.id} value={option.id} disabled={!option.available}>
                  {option.label}
                  {option.available ? '' : ' (precisa do modelo)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode.draft ? (
            <Badge variant="warning">
              <FileText aria-hidden />
              Rascunho
            </Badge>
          ) : (
            <Badge variant="secondary">
              <BookOpen aria-hidden />
              Handbook
            </Badge>
          )}
          {mode.skill?.found ? (
            <Badge asChild variant="outline" className="font-normal">
              <Link
                href={`/catalogo/plugins/${encodeURIComponent(mode.skill.plugin)}`}
                title={mode.skill.description ?? undefined}
              >
                <Puzzle aria-hidden />
                Skill {mode.skill.skill}
              </Link>
            </Badge>
          ) : null}
        </div>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        {mode.description}
        {locked ? ' Trocar de modo começa uma conversa nova.' : ''}
      </p>
    </div>
  )
}
