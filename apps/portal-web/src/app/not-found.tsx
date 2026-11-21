import { SearchX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Página não encontrada' }

export default function RootNotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border bg-card p-10 text-center shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SearchX className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="text-xl font-semibold tracking-tight">Esta página não existe</h1>
          <p className="text-sm text-muted-foreground">
            O endereço pode ter mudado. Volte para o portal e use a busca (Ctrl K).
          </p>
        </div>
        <Button asChild>
          <Link href="/">Ir para Minha página</Link>
        </Button>
      </div>
    </main>
  )
}
