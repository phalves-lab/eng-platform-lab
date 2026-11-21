import { Clock } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { formatDateTime } from '@/lib/format'

interface SiteHeaderProps {
  readonly datasetTitle: string
  readonly pageTitle: string
  readonly generatedAt: string
}

export const SiteHeader = ({ datasetTitle, pageTitle, generatedAt }: SiteHeaderProps) => (
  <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
    <SidebarTrigger className="-ml-1" aria-label="Abrir ou recolher o menu" />
    <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:inline-flex">{datasetTitle}</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        <BreadcrumbItem>
          <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Atualizado em</span>
      <time dateTime={generatedAt}>{formatDateTime(generatedAt)}</time>
    </div>
  </header>
)
