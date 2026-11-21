import { NextResponse } from 'next/server'
import { conversationsApi, historyError } from '@/lib/conversations-api'

export async function GET() {
  try {
    return NextResponse.json(await conversationsApi.list())
  } catch (error) {
    return historyError(error)
  }
}
