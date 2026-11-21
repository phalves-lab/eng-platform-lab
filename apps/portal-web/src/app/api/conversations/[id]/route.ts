import { ConversationIdSchema } from '@lab/contracts'
import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api'
import { conversationsApi, historyError } from '@/lib/conversations-api'

interface RouteContext {
  readonly params: Promise<{ id: string }>
}

const idFrom = async ({ params }: RouteContext) => {
  const parsed = ConversationIdSchema.safeParse((await params).id)
  if (!parsed.success) throw new ApiError(400, 'invalid conversation id')
  return parsed.data
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    return NextResponse.json(await conversationsApi.get(await idFrom(context)))
  } catch (error) {
    return historyError(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await conversationsApi.remove(await idFrom(context))
    return new Response(null, { status: 204 })
  } catch (error) {
    return historyError(error)
  }
}
