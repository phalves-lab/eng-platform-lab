'use client'

import type { ConversationSummary } from '@lab/contracts'
import { History, LoaderCircle, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { questionCount } from '@/lib/conversations'
import { formatDateTime } from '@/lib/labels'
import { cn } from '@/lib/utils'

export type HistoryState =
  { state: 'ready'; items: ConversationSummary[] } | { state: 'off' } | { state: 'error' }

interface ConversationListProps {
  readonly history: HistoryState
  readonly activeId: string | null
  readonly openingId: string | null
  readonly onOpen: (id: string) => void
  readonly onNew: () => void
  readonly onDelete: (id: string) => Promise<boolean>
}

function Notice({ children }: { readonly children: string }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{children}</p>
  )
}

function DeleteButton({
  conversation,
  onDelete,
}: {
  readonly conversation: ConversationSummary
  readonly onDelete: (id: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  const confirm = async () => {
    setDeleting(true)
    setFailed(false)
    const deleted = await onDelete(conversation.id)
    setDeleting(false)
    if (deleted) setOpen(false)
    else setFailed(true)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Apagar a conversa ${conversation.title}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apagar conversa?</DialogTitle>
          <DialogDescription>
            A conversa “{conversation.title}” sai do seu histórico de vez. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível apagar agora. Tente de novo.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()} disabled={deleting}>
            {deleting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            Apagar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Earlier conversations of the person, newest first, with open, new and delete actions. */
export function ConversationList({
  history,
  activeId,
  openingId,
  onOpen,
  onNew,
  onDelete,
}: ConversationListProps) {
  const headingId = useId()
  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Conversas anteriores
        </h3>
        <Button variant="outline" size="sm" onClick={onNew} disabled={activeId === null}>
          <MessageSquarePlus aria-hidden />
          Nova
        </Button>
      </div>

      {history.state === 'off' ? (
        <Notice>
          O histórico não está ligado neste ambiente. As respostas não ficam guardadas.
        </Notice>
      ) : null}
      {history.state === 'error' ? (
        <Notice>Não foi possível carregar o histórico agora. O chat continua funcionando.</Notice>
      ) : null}
      {history.state === 'ready' && history.items.length === 0 ? (
        <Notice>Suas conversas aparecem aqui depois da primeira resposta.</Notice>
      ) : null}

      {history.state === 'ready' && history.items.length > 0 ? (
        <ul className="space-y-1">
          {history.items.map((conversation) => {
            const active = conversation.id === activeId
            return (
              <li
                key={conversation.id}
                className={cn(
                  'flex items-center gap-1 rounded-lg border border-transparent pr-1',
                  active ? 'border-border bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onOpen(conversation.id)}
                >
                  <span className="block truncate text-sm font-medium">{conversation.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {openingId === conversation.id ? (
                      <LoaderCircle className="size-3 animate-spin" aria-hidden />
                    ) : null}
                    {formatDateTime(conversation.updatedAt)} · {questionCount(conversation)}
                  </span>
                </button>
                <DeleteButton conversation={conversation} onDelete={onDelete} />
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
