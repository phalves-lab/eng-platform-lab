const ROUTES = ['visao-geral', 'minha-fila', 'fila', 'alertas', 'metricas', 'reviews'] as const

export type RouteId = (typeof ROUTES)[number]

export interface HashState {
  route: RouteId
  dataset: string | null
  person: string | null
}

const isRoute = (value: string): value is RouteId => (ROUTES as readonly string[]).includes(value)

/** Lê `#/minha-fila?conjunto=demo&pessoa=ana`. Rota desconhecida cai na visão geral. */
export const parseHash = (hash: string): HashState => {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?')
  const params = new URLSearchParams(query)
  return {
    route: isRoute(path) ? path : 'visao-geral',
    dataset: params.get('conjunto'),
    person: params.get('pessoa'),
  }
}

export const toHash = ({
  route,
  dataset,
  person = null,
}: Omit<HashState, 'person'> & { person?: string | null }) => {
  const params = new URLSearchParams()
  if (dataset) params.set('conjunto', dataset)
  if (person) params.set('pessoa', person)
  const query = params.toString()
  return query ? `#/${route}?${query}` : `#/${route}`
}
