const ROUTES = ['visao-geral', 'fila', 'alertas', 'metricas', 'reviews'] as const

export type RouteId = (typeof ROUTES)[number]

export interface HashState {
  route: RouteId
  dataset: string | null
}

const isRoute = (value: string): value is RouteId => (ROUTES as readonly string[]).includes(value)

/** Lê `#/fila?conjunto=demo`. Rota desconhecida cai na visão geral. */
export const parseHash = (hash: string): HashState => {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  return {
    route: isRoute(path) ? path : 'visao-geral',
    dataset: new URLSearchParams(query).get('conjunto'),
  }
}

export const toHash = ({ route, dataset }: HashState) =>
  dataset ? `#/${route}?conjunto=${encodeURIComponent(dataset)}` : `#/${route}`
