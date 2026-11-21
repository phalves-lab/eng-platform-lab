export const SIGN_IN_PATH = '/entrar'
export const DENIED_PATH = '/acesso-negado'
export const EXPIRED_PATH = '/sessao-expirada'

const PUBLIC_PATHS = [SIGN_IN_PATH, DENIED_PATH, EXPIRED_PATH]

export type AccessDecision =
  { kind: 'next' } | { kind: 'unauthorized' } | { kind: 'redirect'; to: string }

export interface AccessRequest {
  pathname: string
  search: string
  signedIn: boolean
  expired: boolean
}

const isPublic = (pathname: string) =>
  pathname.startsWith('/api/auth/') ||
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))

/**
 * What the middleware does with a request in `entra` mode: sign-in pages pass, route handlers of
 * the portal answer 401 without a usable session, and pages go to the sign-in or to the expired
 * session screen, keeping where the person was going.
 */
export const accessDecision = (request: AccessRequest): AccessDecision => {
  if (isPublic(request.pathname)) return { kind: 'next' }
  if (request.signedIn && !request.expired) return { kind: 'next' }
  if (request.pathname.startsWith('/api/')) return { kind: 'unauthorized' }
  const callbackUrl = encodeURIComponent(`${request.pathname}${request.search}`)
  const target = request.signedIn ? EXPIRED_PATH : SIGN_IN_PATH
  return { kind: 'redirect', to: `${target}?callbackUrl=${callbackUrl}` }
}

/** Keeps a post sign-in destination inside the portal: relative paths only, never `//host`. */
export const safeCallbackUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.includes('\\') || PUBLIC_PATHS.some((path) => value.startsWith(path))) return '/'
  return value
}

/** Screen for a portal-api refusal of the session: 401 is an expired session, 403 no access. */
export const screenForStatus = (status: number): string | null => {
  if (status === 401) return EXPIRED_PATH
  if (status === 403) return DENIED_PATH
  return null
}

const SIGN_IN_ERRORS: Record<string, string> = {
  AccessDenied: 'A conta não tem permissão para entrar no portal.',
  Configuration: 'O login do portal está mal configurado. Avise o time de plataforma.',
  Verification: 'O link de entrada expirou. Tente de novo.',
}

/** Message for the `error` code Auth.js puts in the URL after a failed sign-in. */
export const signInErrorMessage = (code: unknown): string | null => {
  if (typeof code !== 'string' || !code) return null
  return SIGN_IN_ERRORS[code] ?? 'Não foi possível entrar agora. Tente de novo.'
}
