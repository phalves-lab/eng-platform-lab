import NextAuth, { type NextAuthConfig } from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { readAuthConfig, signInScopes } from '@/lib/auth-config'
import { needsRefresh, parseApiToken, refreshApiToken, tokenFromAccount } from '@/lib/session-token'

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

/**
 * Auth.js settings for the Entra ID sign-in. The access token for the portal-api stays inside the
 * encrypted JWT cookie (`api` claim); the session handed to the browser carries only the name
 * and whether the token expired.
 */
const buildConfig = (): NextAuthConfig => {
  const config = readAuthConfig(process.env)
  if (config.mode !== 'entra') {
    return { providers: [], secret: 'dev-mode-without-sign-in-0000000000', trustHost: true }
  }
  return {
    secret: config.secret,
    trustHost: true,
    session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: '/entrar', error: '/acesso-negado' },
    providers: [
      MicrosoftEntraID({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        issuer: config.issuer,
        authorization: { params: { scope: signInScopes(config.apiScope) } },
        profile: (profile) => ({
          id: String(profile.sub),
          name: typeof profile.name === 'string' ? profile.name : null,
          email: typeof profile.email === 'string' ? profile.email : null,
          image: null,
        }),
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        if (account) {
          const fresh = tokenFromAccount(account)
          return { ...token, api: fresh }
        }
        const current = parseApiToken(token['api'])
        if (!current || current.error || !needsRefresh(current)) return token
        return {
          ...token,
          api: await refreshApiToken(current, {
            issuer: config.issuer,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            scope: signInScopes(config.apiScope),
          }),
        }
      },
      session({ session, token }) {
        const api = parseApiToken(token['api'])
        return { ...session, expired: !api || Boolean(api.error) }
      },
    },
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig())
