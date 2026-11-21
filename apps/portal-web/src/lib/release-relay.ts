import 'server-only'
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { ApiError } from '@/lib/api'

/**
 * Validates a browser request and forwards it to portal-api from the server, answering with the
 * API error message so the dialog can show why a plan or an execution was refused.
 */
export const relay = async <I, O>(
  request: Request,
  schema: ZodType<I>,
  call: (input: I) => Promise<O>,
) => {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido para a release.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await call(parsed.data))
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Não foi possível falar com a portal-api.' }, { status: 502 })
  }
}
