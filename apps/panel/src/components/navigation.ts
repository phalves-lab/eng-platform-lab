import {
  BellRing,
  ChartColumnBig,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import type { RouteId } from '@/lib/routes'

export interface NavItem {
  id: RouteId
  title: string
  description: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'visao-geral',
    title: 'Visão geral',
    description: 'O que pede atenção agora na esteira.',
    icon: LayoutDashboard,
  },
  {
    id: 'minha-fila',
    title: 'Minha fila',
    description:
      'O que você precisa revisar e o que cada PR seu precisa agora. Escolha seu usuário uma vez e o painel lembra neste navegador.',
    icon: UserRoundCheck,
  },
  {
    id: 'fila',
    title: 'Fila de review',
    description:
      'Na ordem em que cada item entrou em code review no board. Sem histórico no Jira, vale a hora em que o PR ficou pronto.',
    icon: ListOrdered,
  },
  {
    id: 'alertas',
    title: 'Alertas',
    description: 'Situações que travam a entrega ou fogem do combinado do time.',
    icon: BellRing,
  },
  {
    id: 'metricas',
    title: 'Métricas',
    description: 'Como a esteira se comportou nos últimos 30 dias e semana a semana.',
    icon: ChartColumnBig,
  },
  {
    id: 'reviews',
    title: 'Reviews',
    description:
      'Carga de review por pessoa, para equilibrar e reconhecer quem segura o processo. Não é meta individual.',
    icon: UsersRound,
  },
]

export const navItem = (id: RouteId): NavItem =>
  NAV_ITEMS.find((item) => item.id === id) ?? (NAV_ITEMS[0] as NavItem)
