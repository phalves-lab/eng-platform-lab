'use client'

import {
  type ReleaseExecuteResponse,
  ReleaseExecuteResponseSchema,
  type ReleasePublishPlan,
  ReleasePublishPlanSchema,
} from '@lab/contracts'
import { LoaderCircle, Tag } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { confirmationMatches, describeStep } from '@/lib/release-write'
import { ConfirmRepos, failureMessage, Notice, postJson, RunResult } from './release-confirm'

interface ReleasePublishProps {
  readonly project: string
  readonly repo: string
  readonly number: number
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'plan'; plan: ReleasePublishPlan; running: boolean; error: string | null }
  | { kind: 'done'; result: ReleaseExecuteResponse }

function PublishPlanView({ plan }: { readonly plan: ReleasePublishPlan }) {
  return (
    <div className="space-y-4">
      {!plan.writeEnabled ? (
        <Notice
          tone="warning"
          title="A escrita no GitHub está desabilitada neste ambiente"
          items={['Dá para conferir o plano, mas a publicação fica bloqueada.']}
        />
      ) : null}
      {plan.blockers.length ? (
        <Notice tone="danger" title="A publicação não pode ser feita" items={plan.blockers} />
      ) : null}
      {plan.tag ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Tag</dt>
            <dd className="font-mono font-medium break-all">{plan.tag}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Commit do merge</dt>
            <dd className="font-mono">{plan.sha.slice(0, 7) || '—'}</dd>
          </div>
        </dl>
      ) : null}
      {plan.steps.length ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {plan.steps.map((step) => (
            <li key={step.kind} className="break-words">
              {describeStep(step)}
            </li>
          ))}
        </ol>
      ) : null}
      {plan.body ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Ver a nota da release
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {plan.body}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

export function ReleasePublish({ project, repo, number }: ReleasePublishProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [typed, setTyped] = useState<string[]>([])
  const request = { project, repo, number }

  const load = async () => {
    setState({ kind: 'loading' })
    setTyped([])
    try {
      const plan = await postJson('/api/releases/publish/plan', request, ReleasePublishPlanSchema)
      setState({ kind: 'plan', plan, running: false, error: null })
    } catch (error) {
      setState({ kind: 'error', message: failureMessage(error) })
    }
  }

  const run = async (plan: ReleasePublishPlan) => {
    setState({ kind: 'plan', plan, running: true, error: null })
    try {
      const result = await postJson(
        '/api/releases/publish/execute',
        { ...request, hash: plan.hash, confirm: typed.map((value) => value.trim()) },
        ReleaseExecuteResponseSchema,
      )
      setState({ kind: 'done', result })
    } catch (error) {
      setState({ kind: 'plan', plan, running: false, error: failureMessage(error) })
    }
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next && state.kind === 'done') router.refresh()
  }

  const locked =
    state.kind !== 'plan' ||
    !state.plan.writeEnabled ||
    state.plan.blockers.length > 0 ||
    state.running
  const ready = state.kind === 'plan' && !locked && confirmationMatches(typed, state.plan.confirm)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true)
          void load()
        }}
      >
        <Tag aria-hidden />
        Publicar
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Publicar tag e release</DialogTitle>
            <DialogDescription>
              {repo}#{number}. A tag sai do commit do merge e a nota é o corpo da PR de release.
            </DialogDescription>
          </DialogHeader>
          {state.kind === 'loading' ? <Skeleton className="h-32" /> : null}
          {state.kind === 'error' ? (
            <Notice tone="danger" title="Não foi possível montar o plano" items={[state.message]} />
          ) : null}
          {state.kind === 'done' ? <RunResult result={state.result} /> : null}
          {state.kind === 'plan' ? (
            <div className="space-y-4">
              <PublishPlanView plan={state.plan} />
              {state.error ? (
                <Notice tone="danger" title="Publicação recusada" items={[state.error]} />
              ) : null}
              <ConfirmRepos
                repos={state.plan.confirm}
                values={typed}
                disabled={locked}
                onChange={setTyped}
              />
            </div>
          ) : null}
          <DialogFooter>
            {state.kind === 'plan' ? (
              <Button disabled={!ready} onClick={() => void run(state.plan)}>
                {state.running ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <Tag aria-hidden />
                )}
                Publicar no GitHub
              </Button>
            ) : (
              <Button variant="outline" onClick={() => changeOpen(false)}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
