import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface AuthScreenProps {
  readonly icon: LucideIcon
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly notice?: string | null
  readonly children: ReactNode
}

export function AuthScreen({
  icon: Icon,
  eyebrow,
  title,
  description,
  notice,
  children,
}: AuthScreenProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4 sm:p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-10">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {notice ? (
          <p
            role="alert"
            className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {notice}
          </p>
        ) : null}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
          {children}
        </div>
      </div>
    </main>
  )
}
