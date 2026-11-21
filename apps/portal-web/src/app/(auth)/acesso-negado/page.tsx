import { ShieldX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthScreen } from '@/components/auth-screen'
import { Button } from '@/components/ui/button'
import { signInErrorMessage } from '@/lib/access'
import { readAuthConfig } from '@/lib/auth-config'
import { signOutOfPortal } from '@/lib/auth-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Acesso negado' }

interface DeniedPageProps {
  readonly searchParams: Promise<{ error?: string }>
}

export default async function AccessDeniedPage({ searchParams }: DeniedPageProps) {
  const { error } = await searchParams
  const entra = readAuthConfig(process.env).mode === 'entra'
  return (
    <AuthScreen
      icon={ShieldX}
      eyebrow="403"
      title="Você não tem acesso a esta área"
      description="A sua conta entrou, mas nenhum grupo dela dá papel no portal ou nesta página. Peça a inclusão no grupo certo ao time de plataforma."
      notice={signInErrorMessage(error)}
    >
      <Button asChild variant="outline">
        <Link href="/">Ir para Minha página</Link>
      </Button>
      {entra ? (
        <form action={signOutOfPortal}>
          <Button type="submit" className="w-full sm:w-auto">
            Entrar com outra conta
          </Button>
        </form>
      ) : null}
    </AuthScreen>
  )
}
