import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { accessDecision } from '@/lib/access'
import { readAuthConfig } from '@/lib/auth-config'

const authConfig = readAuthConfig(process.env)

/**
 * With a lazy config, Auth.js returns the wrapped middleware inside a promise although its types
 * say a function; `Promise.resolve` covers both shapes.
 */
const guarded = Promise.resolve(
  auth((request) => {
    const decision = accessDecision({
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      signedIn: Boolean(request.auth),
      expired: Boolean(request.auth?.expired),
    })
    if (decision.kind === 'unauthorized') {
      return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 })
    }
    if (decision.kind === 'redirect')
      return NextResponse.redirect(new URL(decision.to, request.url))
    return NextResponse.next()
  }),
)

/** In `dev` mode there is no sign-in; in `entra` mode every page and route needs a session. */
export default async function middleware(request: NextRequest) {
  if (authConfig.mode === 'dev') return NextResponse.next()
  return (await guarded)(request, { params: Promise.resolve({}) })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)'],
}
