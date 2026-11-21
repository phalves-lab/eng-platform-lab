import {
  BookCheck,
  Boxes,
  ChartNoAxesCombined,
  Gauge,
  FileClock,
  GitPullRequestArrow,
  House,
  Languages,
  ListTodo,
  type LucideIcon,
  MessagesSquare,
  Plug,
  Puzzle,
  Rocket,
  SquareKanban,
  Workflow,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import type { User } from '@lab/contracts'

export interface NavItem {
  href: string
  title: string
  icon: LucideIcon
  roles?: readonly User['role'][]
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Trabalho',
    items: [
      { href: '/', title: 'Minha página', icon: House },
      { href: '/review', title: 'Fila de review', icon: GitPullRequestArrow },
      { href: '/pergunte', title: 'Pergunte ao handbook', icon: MessagesSquare },
    ],
  },
  {
    label: 'Conhecimento',
    items: [
      { href: '/padroes', title: 'Padrões', icon: BookCheck },
      { href: '/sistemas', title: 'Sistemas', icon: Boxes },
      { href: '/glossario', title: 'Glossário', icon: Languages },
      { href: '/decisoes', title: 'Decisões pendentes', icon: ListTodo },
    ],
  },
  {
    label: 'Entregas',
    items: [
      { href: '/entregas/review', title: 'Review', icon: ChartNoAxesCombined },
      { href: '/entregas/dora', title: 'DORA', icon: Gauge },
      { href: '/entregas/fluxo', title: 'Fluxo', icon: Workflow },
      { href: '/entregas/boards', title: 'Boards', icon: SquareKanban },
      { href: '/releases', title: 'Releases', icon: Rocket },
    ],
  },
  {
    label: 'Qualidade',
    items: [
      { href: '/qualidade/scorecard', title: 'Scorecard', icon: ShieldCheck },
      { href: '/qualidade/documentacao', title: 'Documentação', icon: FileClock },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/catalogo/plugins', title: 'Plugins e skills', icon: Puzzle },
      { href: '/catalogo/mcps', title: 'MCPs', icon: Plug },
    ],
  },
  {
    label: 'Administração',
    items: [{ href: '/admin/auditoria', title: 'Auditoria', icon: ScrollText, roles: ['admin'] }],
  },
]

/** Menu groups and items the role can open; items without `roles` are open to everyone. */
export const navGroupsFor = (role: User['role']) =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0)

/** Navigation entry that owns the current path, used for highlighting and breadcrumbs. */
export const activeItem = (pathname: string): NavItem | undefined =>
  NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)))
    .at(0)
