'use client'

import { type Conversation, ConversationSchema, type ConversationSummary } from '@lab/contracts'
import { AlertCircle, History, MessageSquarePlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { Turn } from '@/lib/ask-stream'
import { conversationHref, turnsFromConversation, upsertConversation } from '@/lib/conversations'
import { AskChat } from './ask-chat'
import { ConversationList, type HistoryState } from './conversation-list'

interface AskWorkspaceProps {
  readonly history: HistoryState
  readonly conversation: Conversation | null
  readonly notice: string | null
}

interface ChatSession {
  key: number
  id: string | null
  turns: Turn[]
}

const replaceUrl = (id: string | null) =>
  window.history.replaceState(null, '', conversationHref(id))

/** Pergunte with the person's history: open, continue, start or delete a conversation. */
export function AskWorkspace({ history: initialHistory, conversation, notice }: AskWorkspaceProps) {
  const [history, setHistory] = useState<HistoryState>(initialHistory)
  const [session, setSession] = useState<ChatSession>({
    key: 0,
    id: conversation?.id ?? null,
    turns: conversation ? turnsFromConversation(conversation) : [],
  })
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(notice)
  const [sheetOpen, setSheetOpen] = useState(false)

  const startNew = useCallback(() => {
    setSession((current) => ({ key: current.key + 1, id: null, turns: [] }))
    setError(null)
    setSheetOpen(false)
    replaceUrl(null)
  }, [])

  const open = async (id: string) => {
    if (openingId) return
    setOpeningId(id)
    setError(null)
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`)
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'Essa conversa não existe mais.'
            : 'Não foi possível abrir a conversa agora.',
        )
        return
      }
      const loaded = ConversationSchema.parse(await response.json())
      setSession((current) => ({
        key: current.key + 1,
        id: loaded.id,
        turns: turnsFromConversation(loaded),
      }))
      setSheetOpen(false)
      replaceUrl(loaded.id)
    } catch {
      setError('Não foi possível abrir a conversa agora.')
    } finally {
      setOpeningId(null)
    }
  }

  const remove = async (id: string) => {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null)
    if (!response?.ok && response?.status !== 404) return false
    setHistory((current) =>
      current.state === 'ready'
        ? { ...current, items: current.items.filter((item) => item.id !== id) }
        : current,
    )
    if (session.id === id) startNew()
    return true
  }

  const onSaved = useCallback((saved: ConversationSummary) => {
    setSession((current) => (current.id === saved.id ? current : { ...current, id: saved.id }))
    setHistory((current) =>
      current.state === 'ready'
        ? { ...current, items: upsertConversation(current.items, saved) }
        : current,
    )
    replaceUrl(saved.id)
  }, [])

  const list = (
    <ConversationList
      history={history}
      activeId={session.id}
      openingId={openingId}
      onOpen={(id) => void open(id)}
      onNew={startNew}
      onDelete={remove}
    />
  )
  const count = history.state === 'ready' ? history.items.length : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-end gap-2 lg:hidden">
          {session.id ? (
            <Button variant="outline" size="sm" onClick={startNew}>
              <MessageSquarePlus aria-hidden />
              Nova conversa
            </Button>
          ) : null}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <History aria-hidden />
                Conversas{count ? ` (${count})` : ''}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88%] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Suas conversas</SheetTitle>
                <SheetDescription>Abra uma conversa para continuar de onde parou.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">{list}</div>
            </SheetContent>
          </Sheet>
        </div>

        {error ? (
          <p
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-light p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <AskChat
          key={session.key}
          conversationId={session.id}
          initialTurns={session.turns}
          onSaved={onSaved}
        />
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">{list}</div>
      </aside>
    </div>
  )
}
