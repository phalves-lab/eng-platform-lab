import type { ReleaseSidePreview, ReleaseTicket } from '@lab/contracts'
import {
  ArrowUpRight,
  CircleCheckBig,
  Database,
  GitBranch,
  GitPullRequestArrow,
  KeyRound,
} from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { ToneBadge } from '@/components/status-badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CHECKS_LABEL,
  CHECKS_TONE,
  formatDate,
  SIDE_LABEL,
  WARNING_LABEL,
  WARNING_TONE,
} from '@/lib/releases'

function ExternalLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: React.ReactNode
}) {
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

function InlineCode({ text }: { readonly text: string }) {
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={`${index}-${part}`} className="rounded bg-background/80 px-1 font-mono text-xs">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  )
}

function TicketCell({ ticket }: { readonly ticket: ReleaseTicket }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {ticket.key && ticket.url ? (
          <ExternalLink href={ticket.url}>{ticket.key}</ExternalLink>
        ) : (
          <span className="font-medium">{ticket.key ?? 'Sem ticket'}</span>
        )}
        {ticket.multiplePulls ? <ToneBadge tone="info">{ticket.pulls.length} PRs</ToneBadge> : null}
      </div>
      <span className="line-clamp-2 text-sm">{ticket.title}</span>
      {ticket.summary ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">{ticket.summary}</span>
      ) : null}
    </div>
  )
}

function TicketTable({ tickets }: { readonly tickets: ReleaseTicket[] }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56">Ticket</TableHead>
            <TableHead>PRs</TableHead>
            <TableHead>Autores</TableHead>
            <TableHead className="text-right">Itens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.key ?? `pr-${ticket.pulls[0]?.number}`}>
              <TableCell className="whitespace-normal">
                <TicketCell ticket={ticket} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-0.5 text-sm">
                  {ticket.pulls.map((pull) => (
                    <ExternalLink key={pull.number} href={pull.url}>
                      #{pull.number}
                    </ExternalLink>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {ticket.authors.join(', ') || 'bot'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  {ticket.sql.length ? <ToneBadge tone="warning">SQL</ToneBadge> : null}
                  {ticket.env.names.length || ticket.env.notes.length ? (
                    <ToneBadge tone="warning">ENV</ToneBadge>
                  ) : null}
                  {!ticket.sql.length && !ticket.env.notes.length ? (
                    <span className="text-xs text-muted-foreground">nenhum</span>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function WarningBlock({
  icon: Icon,
  title,
  ticket,
  children,
}: {
  readonly icon: typeof Database
  readonly title: string
  readonly ticket: ReleaseTicket
  readonly children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-warning/40 bg-warning-light/60 dark:bg-warning-light/40">
      <header className="flex flex-wrap items-center gap-2 border-b border-warning/30 px-3 py-2 text-sm">
        <Icon className="size-4 text-warning-dark" aria-hidden />
        <span className="font-medium text-warning-dark">{title}</span>
        <span className="text-muted-foreground">
          {ticket.key ?? 'Sem ticket'} · {ticket.pulls.map((pull) => `#${pull.number}`).join(', ')}
        </span>
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}

function SqlAndEnv({ tickets }: { readonly tickets: ReleaseTicket[] }) {
  const withSql = tickets.filter((ticket) => ticket.sql.length)
  const withEnv = tickets.filter((ticket) => ticket.env.names.length || ticket.env.notes.length)
  if (!withSql.length && !withEnv.length) {
    return <p className="text-sm text-muted-foreground">Nenhum SQL nem ENV nesta release.</p>
  }
  return (
    <div className="space-y-3">
      {withSql.map((ticket) => (
        <WarningBlock
          key={`sql-${ticket.key ?? ticket.pulls[0]?.number}`}
          icon={Database}
          title="SQL"
          ticket={ticket}
        >
          <div className="space-y-2">
            {ticket.sql.map((sql) => (
              <pre
                key={sql}
                className="overflow-x-auto rounded-md bg-background/80 p-3 font-mono text-xs leading-relaxed"
              >
                <code>{sql}</code>
              </pre>
            ))}
          </div>
        </WarningBlock>
      ))}
      {withEnv.map((ticket) => (
        <WarningBlock
          key={`env-${ticket.key ?? ticket.pulls[0]?.number}`}
          icon={KeyRound}
          title="ENV"
          ticket={ticket}
        >
          {ticket.env.names.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ticket.env.names.map((name) => (
                <code
                  key={name}
                  className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs font-medium"
                >
                  {name}
                </code>
              ))}
            </div>
          ) : null}
          <ul className="space-y-1 text-sm">
            {ticket.env.notes.map((note) => (
              <li key={note} className="break-words">
                <InlineCode text={note} />
              </li>
            ))}
          </ul>
        </WarningBlock>
      ))}
    </div>
  )
}

function SideMeta({ side }: { readonly side: ReleaseSidePreview }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-muted-foreground">À frente</dt>
        <dd className="text-lg font-semibold tabular-nums">{side.aheadBy}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Atrás</dt>
        <dd
          className={
            side.behindBy
              ? 'text-lg font-semibold text-warning tabular-nums'
              : 'text-lg font-semibold tabular-nums'
          }
        >
          {side.behindBy}
        </dd>
      </div>
      <div className="col-span-2 min-w-0">
        <dt className="text-xs text-muted-foreground">Último corte</dt>
        <dd className="truncate">
          {side.cutoff.url && side.cutoff.ref ? (
            <ExternalLink href={side.cutoff.url}>
              {side.cutoff.kind === 'tag' ? `Tag ${side.cutoff.ref}` : `Release ${side.cutoff.ref}`}
            </ExternalLink>
          ) : (
            <span className="text-muted-foreground">Nenhum</span>
          )}
          {side.cutoff.at ? (
            <span className="text-muted-foreground"> em {formatDate(side.cutoff.at)}</span>
          ) : null}
        </dd>
      </div>
    </dl>
  )
}

export function ReleaseSide({ side }: { readonly side: ReleaseSidePreview }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          {SIDE_LABEL[side.side]}
          <span className="min-w-0 truncate font-mono text-xs font-normal text-muted-foreground">
            {side.repo}
          </span>
        </CardTitle>
        <CardDescription className="flex min-w-0 flex-wrap items-center gap-1.5">
          <GitBranch className="size-3.5" aria-hidden />
          <span className="font-mono text-xs">{side.source}</span>
          <span aria-hidden>→</span>
          <span className="font-mono text-xs">{side.target}</span>
        </CardDescription>
        <CardAction>
          <ToneBadge tone={CHECKS_TONE[side.checks.state]}>
            {CHECKS_LABEL[side.checks.state]}
          </ToneBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <SideMeta side={side} />

        {side.openRelease || side.releaseBranch ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            {side.openRelease ? (
              <p className="flex flex-wrap items-center gap-1.5">
                <GitPullRequestArrow className="size-4 text-primary" aria-hidden />
                PR de release aberta:
                <ExternalLink href={side.openRelease.url}>#{side.openRelease.number}</ExternalLink>
                <span className="text-muted-foreground">({side.openRelease.head})</span>
              </p>
            ) : null}
            {side.releaseBranch ? (
              <p className="flex flex-wrap items-center gap-1.5">
                <GitBranch className="size-4 text-primary" aria-hidden />
                Branch que a geração vai criar:
                <code className="font-mono text-xs">{side.releaseBranch}</code>
              </p>
            ) : null}
          </div>
        ) : null}

        {side.warnings.length ? (
          <ul className="divide-y rounded-lg border" aria-label="Alertas">
            {side.warnings.map((warning) => (
              <li key={warning.code} className="flex items-start gap-3 px-3 py-2.5">
                <ToneBadge tone={WARNING_TONE[warning.level]}>
                  {WARNING_LABEL[warning.code]}
                </ToneBadge>
                <p className="text-sm">{warning.message}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {side.tickets.length} ticket(s) em {side.pulls} PR(s)
          </h3>
          {side.tickets.length ? (
            <TicketTable tickets={side.tickets} />
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title="Nada novo"
              description={`Nenhum PR mergeado em ${side.source} desde o último corte.`}
            />
          )}
        </div>

        {side.tickets.length ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">SQL e ENV</h3>
            <SqlAndEnv tickets={side.tickets} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
