'use client'

import type { ReleaseExecuteResponse } from '@lab/contracts'
import { ArrowUpRight, CircleAlert, CircleCheckBig, GitBranch, Lock } from 'lucide-react'
import { useId } from 'react'
import type { ZodType } from 'zod'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/release-write'
import { cn } from '@/lib/utils'

/** Posts to the portal route handlers, which relay to portal-api from the server. */
export const postJson = async <T,>(path: string, body: unknown, schema: ZodType<T>) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(response.status, payload))
  return schema.parse(payload)
}

export const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível falar com o portal agora.'

export function Notice({
  tone,
  title,
  items,
}: {
  readonly tone: 'warning' | 'danger'
  readonly title: string
  readonly items: readonly string[]
}) {
  const Icon = tone === 'danger' ? CircleAlert : Lock
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-sm',
        tone === 'danger'
          ? 'border-destructive/40 bg-destructive-light text-destructive'
          : 'border-warning/40 bg-warning-light/60 text-warning-dark dark:bg-warning-light/40',
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
      </p>
      {items.length ? (
        <ul className="mt-1.5 list-disc space-y-1 pl-6">
          {items.map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** One input per repository; the execution only unlocks when each name is typed exactly. */
export function ConfirmRepos({
  repos,
  values,
  disabled,
  onChange,
}: {
  readonly repos: readonly string[]
  readonly values: readonly string[]
  readonly disabled: boolean
  readonly onChange: (values: string[]) => void
}) {
  const id = useId()
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">Confirme digitando o nome do repositório</legend>
      {repos.map((repo, index) => (
        <div key={repo} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${index}`} className="text-xs text-muted-foreground">
            Digite <code className="font-mono text-foreground">{repo}</code>
          </label>
          <Input
            id={`${id}-${index}`}
            value={values[index] ?? ''}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-invalid={Boolean(values[index]) && values[index]?.trim() !== repo}
            onChange={(event) => {
              const next = repos.map((_, position) => values[position] ?? '')
              next[index] = event.target.value
              onChange(next)
            }}
          />
        </div>
      ))}
    </fieldset>
  )
}

function Link({ href, children }: { readonly href: string; readonly children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium underline-offset-4 hover:text-primary hover:underline"
    >
      {children}
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  )
}

export function RunResult({ result }: { readonly result: ReleaseExecuteResponse }) {
  const ok = result.status === 'success'
  return (
    <div className="space-y-3" aria-live="polite">
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
          ok
            ? 'border-success/40 bg-success-light text-success-dark'
            : 'border-destructive/40 bg-destructive-light text-destructive',
        )}
      >
        {ok ? (
          <CircleCheckBig className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <p>
          {ok
            ? `Concluído: ${result.completed} de ${result.total} passo(s) no GitHub.`
            : `Parou no passo ${result.completed + 1} de ${result.total}: ${result.error ?? 'erro desconhecido'}. O que já foi escrito está abaixo e ficou na auditoria.`}
        </p>
      </div>
      <ul className="space-y-1.5 text-sm">
        {result.branches.map((branch) => (
          <li key={`${branch.repo}:${branch.name}`} className="flex flex-wrap items-center gap-1.5">
            <GitBranch className="size-4 text-primary" aria-hidden />
            Branch criada: <code className="font-mono text-xs">{branch.name}</code>
            <span className="text-muted-foreground">em {branch.repo}</span>
          </li>
        ))}
        {result.pulls.map((pull) => (
          <li key={pull.url} className="flex flex-wrap items-center gap-1.5">
            {pull.action === 'created' ? 'PR aberta:' : 'PR atualizada:'}
            <Link href={pull.url}>
              {pull.repo}#{pull.number}
            </Link>
          </li>
        ))}
        {result.release ? (
          <li className="flex flex-wrap items-center gap-1.5">
            Release publicada:
            <Link href={result.release.url}>{result.release.tag}</Link>
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-muted-foreground">Registro de auditoria #{result.runId}.</p>
    </div>
  )
}
