import { CalendarCheck, Plug, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import { CatalogUnavailable } from '@/components/catalog/catalog-unavailable'
import { CopyBlock } from '@/components/catalog/copy-block'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { whenAvailable } from '@/lib/catalog'
import { CLIENT_LABEL, formatDate, SCOPE_LABEL, SCOPE_TONE } from '@/lib/labels'

export const metadata: Metadata = { title: 'MCPs' }

const Facts = ({ title, items }: { readonly title: string; readonly items: string[] }) => (
  <section className="space-y-1.5">
    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
    <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed marker:text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </section>
)

export default async function McpsPage() {
  const mcps = await whenAvailable(api.mcps())

  return (
    <>
      <PageHeader
        title="MCPs"
        description="Servidores MCP homologados pelo time: o que cada um acessa, se só lê ou também escreve, e como instalar em cada cliente."
      />
      {!mcps ? <CatalogUnavailable /> : null}
      {mcps && !mcps.length ? (
        <EmptyState
          icon={Plug}
          title="Nenhum MCP homologado"
          description="Cadastre os servidores em catalog/ai/mcps.yaml."
        />
      ) : null}
      {mcps?.length ? (
        <div className="space-y-6">
          {mcps.map((mcp) => (
            <Card key={mcp.name}>
              <CardHeader>
                <CardTitle className="font-mono text-base">{mcp.name}</CardTitle>
                <CardAction>
                  <ToneBadge tone={SCOPE_TONE[mcp.scope]}>{SCOPE_LABEL[mcp.scope]}</ToneBadge>
                </CardAction>
                <CardDescription className="col-span-full max-w-3xl">
                  {mcp.description}
                </CardDescription>
                <p className="col-span-full flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <UserRound className="size-3.5" aria-hidden />
                    {mcp.owner}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="size-3.5" aria-hidden />
                    Revisado em {formatDate(mcp.reviewedAt)}
                  </span>
                </p>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-5">
                <div className="space-y-4 md:col-span-2">
                  <Facts title="O que acessa" items={mcp.accesses} />
                  {mcp.cautions.length ? <Facts title="Cuidados" items={mcp.cautions} /> : null}
                </div>
                <Tabs defaultValue={mcp.install[0]?.client} className="min-w-0 md:col-span-3">
                  <TabsList aria-label={`Instalação do ${mcp.name}`}>
                    {mcp.install.map((entry) => (
                      <TabsTrigger key={entry.client} value={entry.client}>
                        {CLIENT_LABEL[entry.client]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {mcp.install.map((entry) => (
                    <TabsContent key={entry.client} value={entry.client}>
                      <CopyBlock
                        label={entry.language === 'bash' ? 'Terminal' : 'Configuração'}
                        caption={entry.file}
                        code={entry.snippet}
                        wrap={entry.language === 'bash'}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  )
}
