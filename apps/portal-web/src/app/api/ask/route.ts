import { AskRequestSchema } from '@lab/contracts'
import { NextResponse } from 'next/server'
import { api, ApiError } from '@/lib/api'

export async function POST(request: Request) {
  const parsed = AskRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A pergunta precisa ter entre 3 e 500 caracteres.' },
      { status: 400 },
    )
  }
  try {
    return NextResponse.json(await api.ask(parsed.data.question))
  } catch (error) {
    const status = error instanceof ApiError && error.status === 429 ? 429 : 502
    return NextResponse.json({ error: 'Não foi possível consultar o handbook agora.' }, { status })
  }
}
