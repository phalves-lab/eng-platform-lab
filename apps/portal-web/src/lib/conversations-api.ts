import 'server-only'
import { ConversationSchema, ConversationSummarySchema } from '@lab/contracts'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError } from '@/lib/api'

const baseUrl = () => process.env.PORTAL_API_URL ?? 'http://localhost:4100'

const call = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new ApiError(response.status, `portal-api ${response.status} on ${path}`)
  return response
}

const pathOf = (id: string) => `/api/conversations/${encodeURIComponent(id)}`

/** Server-side client for the chat history of the signed-in person. */
export const conversationsApi = {
  list: async () =>
    z.array(ConversationSummarySchema).parse(await (await call('/api/conversations')).json()),
  get: async (id: string) => ConversationSchema.parse(await (await call(pathOf(id))).json()),
  remove: async (id: string) => {
    await call(pathOf(id), { method: 'DELETE' })
  },
}

const MESSAGES: Record<number, string> = {
  400: 'Conversa inválida.',
  404: 'Essa conversa não existe mais.',
  503: 'O histórico de conversas não está disponível agora.',
}

/** Turns a portal-api failure into the JSON error the browser shows. */
export const historyError = (error: unknown) => {
  const status = error instanceof ApiError && MESSAGES[error.status] ? error.status : 502
  return NextResponse.json(
    { error: MESSAGES[status] ?? 'Não foi possível consultar o histórico agora.' },
    { status },
  )
}
