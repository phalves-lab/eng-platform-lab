import { LogIn } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthScreen } from '@/components/auth-screen'
import { Button } from '@/components/ui/button'
import { safeCallbackUrl, signInErrorMessage } from '@/lib/access'
import { readAuthConfig } from '@/lib/auth-config'
import { signInWithEntra } from '@/lib/auth-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Entrar' }

interface SignInPageProps {
  readonly searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl, error } = await searchParams
  if (readAuthConfig(process.env).mode === 'dev') redirect(safeCallbackUrl(callbackUrl))
  return (
    <AuthScreen
      icon={LogIn}
      eyebrow="Portal de engenharia"
      title="Entre com a sua conta corporativa"
      description="O acesso usa o login único da empresa. O seu papel no portal vem dos grupos da sua conta."
      notice={signInErrorMessage(error)}
    >
      <form action={signInWithEntra} className="w-full sm:w-auto">
        <input type="hidden" name="callbackUrl" value={safeCallbackUrl(callbackUrl)} />
        <Button type="submit" className="w-full sm:w-auto">
          Entrar com a conta Microsoft
        </Button>
      </form>
    </AuthScreen>
  )
}
