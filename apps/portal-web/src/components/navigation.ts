import {
  BookCheck,
  Boxes,
  ChartNoAxesCombined,
  GitPullRequestArrow,
  House,
  Languages,
  ListTodo,
  type LucideIcon,
  MessagesSquare,
} from 'lucide-react'

export interface NavItem {
  href: string
  title: string
  icon: LucideIcon
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
    items: [{ href: '/entregas/review', title: 'Review', icon: ChartNoAxesCombined }],
  },
]

/** Navigation entry that owns the current path, used for highlighting and breadcrumbs. */
export const activeItem = (pathname: string): NavItem | undefined =>
  NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)))
    .at(0)
