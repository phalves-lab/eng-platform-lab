import type { ChatMode, Conversation } from '@lab/contracts'
import type { Metadata } from 'next'
import { AskWorkspace } from '@/components/ask/ask-workspace'
import type { HistoryState } from '@/components/ask/conversation-list'
import { PageHeader } from '@/components/page-header'
import { ApiError, api } from '@/lib/api'
import { ASK_MODE, selectableModes } from '@/lib/chat-modes'
import { CONVERSATION_PARAM, parseConversationId } from '@/lib/conversations'
import { conversationsApi } from '@/lib/conversations-api'

export const metadata: Metadata = { title: 'Pergunte ao handbook' }

interface AskPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

const loadModes = async (): Promise<ChatMode[]> => {
  try {
    return selectableModes(await api.chatModes())
  } catch {
    return [ASK_MODE]
  }
}

const loadHistory = async (): Promise<HistoryState> => {
  try {
    return { state: 'ready', items: await conversationsApi.list() }
  } catch (error) {
    return error instanceof ApiError && error.status === 503 ? { state: 'off' } : { state: 'error' }
  }
}

const loadConversation = async (
  id: string | null,
  history: HistoryState,
): Promise<{ conversation: Conversation | null; notice: string | null }> => {
  if (!id || history.state !== 'ready') return { conversation: null, notice: null }
  try {
    return { conversation: await conversationsApi.get(id), notice: null }
  } catch (error) {
    const notice =
      error instanceof ApiError && error.status === 404
        ? 'Essa conversa não existe mais. Comece uma conversa nova.'
        : 'Não foi possível abrir a conversa agora.'
    return { conversation: null, notice }
  }
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const id = parseConversationId((await searchParams)[CONVERSATION_PARAM])
  const [history, modes] = await Promise.all([loadHistory(), loadModes()])
  const { conversation, notice } = await loadConversation(id, history)
  return (
    <>
      <PageHeader
        title="Pergunte ao handbook"
        description="Pergunte sobre padrões, sistemas, siglas ou decisões, ou escolha um modo de rascunho: refinar task, descrição de PR, nota de release, ADR ou resumo da semana. Rascunhos não são gravados em lugar nenhum."
      />
      <AskWorkspace
        modes={modes}
        key={conversation?.id ?? 'nova'}
        history={history}
        conversation={conversation}
        notice={notice}
      />
    </>
  )
}
