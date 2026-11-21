import { ModeChatRequestSchema } from '@lab/contracts'
import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'
import { validatedAskStream } from '@/lib/ask-stream'

/**
 * Relays the streamed answer from portal-api to the browser, in the chosen chat mode. The browser
 * only talks to this route; closing the page aborts the upstream request and the model call.
 */
export async function POST(request: Request) {
  const parsed = ModeChatRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'O texto precisa ter entre 3 e 500 caracteres no modo Perguntar e até 8.000 nos rascunhos.',
      },
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
