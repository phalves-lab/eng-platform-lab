import { ChatRequestSchema } from '@lab/contracts'
import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { validatedAskStream } from '@/lib/ask-stream'

/**
 * Relays the streamed answer from portal-api to the browser. The browser only talks to this
 * route; closing the page aborts the upstream request and, with it, the model call.
 */
export async function POST(request: Request) {
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A pergunta precisa ter entre 3 e 500 caracteres.' },
      { status: 400 },
    )
  }
  try {
    const upstream = await api.askStream(parsed.data, request.signal)
    return new Response(upstream.pipeThrough(validatedAskStream()), {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 })
    }
    if (error instanceof ApiError && error.status === 404) {
      return NextResponse.json(
        { error: 'Essa conversa não existe mais. Comece uma conversa nova.' },
        { status: 404 },
      )
    }
    if (error instanceof ApiError && error.status === 429) {
      return NextResponse.json(
        { error: 'Muitas perguntas em pouco tempo. Espere um minuto e tente de novo.' },
        { status: 429 },
      )
    }
    return NextResponse.json(
      { error: 'Não foi possível consultar o handbook agora.' },
      { status: 502 },
    )
  }
}
