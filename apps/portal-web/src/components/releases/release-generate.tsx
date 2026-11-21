'use client'

import {
  type ReleaseExecuteResponse,
  ReleaseExecuteResponseSchema,
  type ReleasePlan,
  type ReleasePlanPull,
  ReleasePlanSchema,
  type ReleaseSideFilter,
} from '@lab/contracts'
import { ArrowUpRight, LoaderCircle, Rocket } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ToneBadge } from '@/components/status-badge'
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
import { confirmationMatches, describeStep, sidesText } from '@/lib/release-write'
import { SIDE_LABEL } from '@/lib/releases'
import { ConfirmRepos, failureMessage, Notice, postJson, RunResult } from './release-confirm'

interface ReleaseGenerateProps {
  readonly canWrite: boolean
  readonly project: string
  readonly side: ReleaseSideFilter
  readonly source: string
  readonly target: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'plan'; plan: ReleasePlan; running: boolean; error: string | null }
  | { kind: 'done'; plan: ReleasePlan; result: ReleaseExecuteResponse }

function PlanPull({ pull }: { readonly pull: ReleasePlanPull }) {
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium break-all">{pull.repo}</span>
        <ToneBadge tone="secondary">{sidesText(pull.sides)}</ToneBadge>
        {pull.existing ? (
          <ToneBadge tone="info">Atualiza #{pull.existing.number}</ToneBadge>
        ) : (
          <ToneBadge tone="success">PR nova</ToneBadge>
        )}
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">
        {pull.head} → {pull.base} · {pull.sha.slice(0, 7)}
      </p>
      <p className="text-sm">
        {pull.tickets} ticket(s) em {pull.pulls} PR(s)
        {pull.assignees.length ? ` · autores: ${pull.assignees.join(', ')}` : ''}
      </p>
      {pull.existing ? (
        <a
          href={pull.existing.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
        >
          Ver a PR atual
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      ) : null}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Ver o corpo da PR
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
          {pull.body}
        </pre>
      </details>
    </li>
  )
}

function PlanView({ plan }: { readonly plan: ReleasePlan }) {
  return (
    <div className="space-y-4">
      {!plan.writeEnabled ? (
        <Notice
          tone="warning"
          title="A escrita no GitHub está desabilitada neste ambiente"
          items={['Dá para conferir o plano, mas a execução fica bloqueada até a flag ser ligada.']}
        />
      ) : null}
      {plan.blockers.length ? (
        <Notice tone="danger" title="O plano não pode ser executado" items={plan.blockers} />
      ) : null}
      <section className="space-y-2" aria-label="PRs de release">
        <h3 className="text-sm font-medium">
          {plan.pulls.length > 1 ? 'Duas PRs, ligadas uma à outra' : 'Uma PR de release'}
        </h3>
        <ul className="space-y-2">
          {plan.pulls.map((pull) => (
            <PlanPull key={pull.repo} pull={pull} />
          ))}
        </ul>
      </section>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">SQL</dt>
          <dd className="font-semibold tabular-nums">{plan.checklist.sql.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">ENV</dt>
          <dd className="font-semibold tabular-nums">{plan.checklist.env.length}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Ordem de deploy</dt>
          <dd className="font-semibold">
            {plan.deployOrder
              ? plan.deployOrder.sides.map((item) => SIDE_LABEL[item]).join(' → ')
              : 'Um lado só'}
          </dd>
        </div>
      </dl>
      <section className="space-y-2" aria-label="Passos no GitHub">
        <h3 className="text-sm font-medium">O que o portal vai fazer no GitHub</h3>
        {plan.steps.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {plan.steps.map((step, index) => (
              <li key={`${step.kind}-${index}`} className="break-words">
                {describeStep(step)}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum passo.</p>
        )}
        <p className="font-mono text-xs text-muted-foreground">
          Plano {plan.hash.slice(0, 12)} · nunca faz merge nem push em branch existente
        </p>
      </section>
    </div>
  )
}

function GenerateDialogBody({
  state,
  typed,
  onType,
}: {
  readonly state: State
  readonly typed: string[]
  readonly onType: (values: string[]) => void
}) {
  if (state.kind === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Montando o plano">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (state.kind === 'error') {
    return <Notice tone="danger" title="Não foi possível montar o plano" items={[state.message]} />
  }
  if (state.kind === 'done') return <RunResult result={state.result} />
  const locked = !state.plan.writeEnabled || state.plan.blockers.length > 0
  return (
    <div className="space-y-4">
      <PlanView plan={state.plan} />
      {state.error ? (
        <Notice tone="danger" title="Execução recusada" items={[state.error]} />
      ) : null}
      <ConfirmRepos
        repos={state.plan.confirm}
        values={typed}
        disabled={locked || state.running}
        onChange={onType}
      />
    </div>
  )
}

export function ReleaseGenerate({ canWrite, project, side, source, target }: ReleaseGenerateProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [typed, setTyped] = useState<string[]>([])
  const request = { project, side, source, target }

  const loadPlan = async () => {
    setState({ kind: 'loading' })
    setTyped([])
    try {
      const plan = await postJson('/api/releases/plan', request, ReleasePlanSchema)
      setState({ kind: 'plan', plan, running: false, error: null })
    } catch (error) {
      setState({ kind: 'error', message: failureMessage(error) })
    }
  }

  const run = async (plan: ReleasePlan) => {
    setState({ kind: 'plan', plan, running: true, error: null })
    try {
      const result = await postJson(
        '/api/releases/execute',
        { ...request, hash: plan.hash, confirm: typed.map((value) => value.trim()) },
        ReleaseExecuteResponseSchema,
      )
      setState({ kind: 'done', plan, result })
      router.refresh()
    } catch (error) {
      setState({ kind: 'plan', plan, running: false, error: failureMessage(error) })
    }
  }

  const ready =
    state.kind === 'plan' &&
    state.plan.writeEnabled &&
    !state.plan.blockers.length &&
    !state.running &&
    confirmationMatches(typed, state.plan.confirm)

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        disabled={!canWrite}
        aria-describedby="generate-release-hint"
        onClick={() => {
          setOpen(true)
          void loadPlan()
        }}
      >
        <Rocket aria-hidden />
        Gerar release
      </Button>
      <span id="generate-release-hint" className="text-xs text-muted-foreground">
        {canWrite
          ? 'Mostra o plano antes de escrever no GitHub'
          : 'Só líder ou admin gera a release'}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {state.kind === 'done' ? 'Resultado da release' : 'Plano da release'}
            </DialogTitle>
            <DialogDescription>
              {state.kind === 'done'
                ? 'O que foi escrito no GitHub, com links.'
                : `${source} → ${target}. Nada foi escrito ainda: confira o plano e confirme.`}
            </DialogDescription>
          </DialogHeader>
          <GenerateDialogBody state={state} typed={typed} onType={setTyped} />
          <DialogFooter>
            {state.kind === 'plan' ? (
              <>
                <Button variant="outline" onClick={() => void loadPlan()} disabled={state.running}>
                  Gerar o plano de novo
                </Button>
                <Button disabled={!ready} onClick={() => void run(state.plan)}>
                  {state.running ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <Rocket aria-hidden />
                  )}
                  Executar no GitHub
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
