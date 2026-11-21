import { TimerOff } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthScreen } from '@/components/auth-screen'
import { Button } from '@/components/ui/button'
import { safeCallbackUrl } from '@/lib/access'
import { readAuthConfig } from '@/lib/auth-config'
import { signInWithEntra } from '@/lib/auth-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sessão expirada' }

interface ExpiredPageProps {
  readonly searchParams: Promise<{ callbackUrl?: string }>
}

export default async function SessionExpiredPage({ searchParams }: ExpiredPageProps) {
  const { callbackUrl } = await searchParams
  if (readAuthConfig(process.env).mode === 'dev') redirect(safeCallbackUrl(callbackUrl))
  return (
    <AuthScreen
      icon={TimerOff}
      eyebrow="Sessão expirada"
      title="Sua sessão terminou"
      description="Por segurança, o portal pede para entrar de novo depois de um tempo. Você volta para a mesma página."
    >
      <form action={signInWithEntra} className="w-full sm:w-auto">
        <input type="hidden" name="callbackUrl" value={safeCallbackUrl(callbackUrl)} />
        <Button type="submit" className="w-full sm:w-auto">
          Entrar de novo
        </Button>
      </form>
    </AuthScreen>
  )
}
