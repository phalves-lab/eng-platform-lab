import type { PanelDataset } from '@lab/eng-metrics/contract'
import { Check, ChevronsUpDown, GitPullRequestArrow, Moon, Sun } from 'lucide-react'
import { NAV_ITEMS } from '@/components/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import type { Theme } from '@/hooks/use-theme'
import { formatRelative } from '@/lib/format'
import { buildMyQueue } from '@/lib/my-queue'
import { type RouteId, toHash } from '@/lib/routes'

interface AppSidebarProps {
  readonly datasets: PanelDataset[]
  readonly current: PanelDataset
  readonly route: RouteId
  readonly person: string | null
  readonly now: number
  readonly theme: Theme
  readonly onToggleTheme: () => void
}

const badgeFor = (dataset: PanelDataset, route: RouteId, person: string | null): number | null => {
  if (route === 'minha-fila') return person ? buildMyQueue(dataset.queue, person).actions : null
  if (route === 'fila') return dataset.queue.length
  if (route === 'alertas') return dataset.alerts.length
  return null
}

const DatasetSwitcher = ({
  datasets,
  current,
  route,
}: Pick<AppSidebarProps, 'datasets' | 'current' | 'route'>) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <SidebarMenuButton
        size="lg"
        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
      >
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <GitPullRequestArrow className="size-4" aria-hidden />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">Painel de review</span>
          <span className="truncate text-xs text-muted-foreground">{current.title}</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4" aria-hidden />
      </SidebarMenuButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-56" align="start" side="bottom">
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Conjunto de dados
      </DropdownMenuLabel>
      {datasets.map((dataset) => (
        <DropdownMenuItem key={dataset.id} asChild>
          <a href={toHash({ route, dataset: dataset.id })} className="flex items-start gap-2">
            <div className="grid flex-1">
              <span>{dataset.title}</span>
              <span className="text-xs text-muted-foreground">{dataset.label}</span>
            </div>
            {dataset.id === current.id ? (
              <Check className="size-4" aria-label="Selecionado" />
            ) : null}
          </a>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)

export const AppSidebar = ({
  datasets,
  current,
  route,
  person,
  now,
  theme,
  onToggleTheme,
}: AppSidebarProps) => (
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <DatasetSwitcher datasets={datasets} current={current} route={route} />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Esteira</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const badge = badgeFor(current, item.id, person)
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild isActive={item.id === route} tooltip={item.title}>
                    <a
                      href={toHash({
                        route: item.id,
                        dataset: current.id,
                        person: item.id === 'minha-fila' ? person : null,
                      })}
                    >
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                  {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={onToggleTheme}
            tooltip={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        Dados de {formatRelative(current.generatedAt, now)}. Atualiza a cada 30 min em horário
        comercial.
      </p>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
)
