import { ArrowLeft, Info } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CatalogUnavailable } from '@/components/catalog/catalog-unavailable'
import { CopyBlock } from '@/components/catalog/copy-block'
import { ToneBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { whenAvailable } from '@/lib/catalog'
import { formatDate, MATURITY_LABEL, MATURITY_TONE } from '@/lib/labels'

interface PluginProps {
  readonly params: Promise<{ name: string }>
}

export async function generateMetadata({ params }: PluginProps): Promise<Metadata> {
  return { title: (await params).name }
}

const BackLink = () => (
  <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
    <Link href="/catalogo/plugins">
      <ArrowLeft aria-hidden />
      Plugins e skills
    </Link>
  </Button>
)

export default async function PluginPage({ params }: PluginProps) {
  const { name } = await params
  const plugin = await whenAvailable(api.plugin(name)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
  if (!plugin) {
    return (
      <>
        <BackLink />
        <CatalogUnavailable />
      </>
    )
  }

  const facts = [
    { label: 'Dono', value: plugin.owner ?? 'Sem dono definido' },
    {
      label: 'Última revisão',
      value: plugin.reviewedAt ? formatDate(plugin.reviewedAt) : 'Nunca revisado',
    },
    { label: 'Autor', value: plugin.author ?? 'Não informado' },
    { label: 'Versão', value: plugin.version ?? 'Sem versão' },
  ]

  return (
    <>
      <BackLink />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{plugin.name}</span>
          <ToneBadge tone={MATURITY_TONE[plugin.maturity]}>
            {MATURITY_LABEL[plugin.maturity]}
          </ToneBadge>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{plugin.displayName}</h2>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          {plugin.description}
        </p>
        {plugin.keywords.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Palavras-chave">
            {plugin.keywords.map((keyword) => (
              <li key={keyword}>
                <Badge variant="outline">{keyword}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {plugin.maturity === 'draft' ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Este plugin ainda não passou pela curadoria do time: não tem dono nem revisão registrados
          em catalog/ai/plugins.yaml.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border bg-card p-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {fact.label}
            </dt>
            <dd className="mt-2 text-sm break-words">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Skills</CardTitle>
            <CardDescription>
              {plugin.skills.length
                ? 'O agente escolhe a skill pela descrição; ela também pode ser chamada pelo nome.'
                : 'Este plugin não traz skills.'}
            </CardDescription>
          </CardHeader>
          {plugin.skills.length ? (
            <CardContent>
              <ul className="divide-y">
                {plugin.skills.map((skill) => (
                  <li key={skill.name} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <p className="font-mono text-sm font-medium">{skill.name}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {skill.description}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>

        <Card className="h-fit lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Instalação no Claude Code</CardTitle>
            <CardDescription>
              Rode dentro do Claude Code. O primeiro comando só é preciso uma vez por máquina.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyBlock label="Comandos" code={plugin.install.commands.join('\n')} wrap />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
