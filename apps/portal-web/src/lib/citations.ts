import type { Citation } from '@lab/contracts'

/** Portal page that shows the cited item; passages have no page of their own. */
export const citationHref = (citation: Citation): string | null => {
  switch (citation.kind) {
    case 'standard':
      return `/padroes/${encodeURIComponent(citation.ref)}`
    case 'system':
      return `/sistemas/${encodeURIComponent(citation.ref)}`
    case 'term':
      return `/glossario?termo=${encodeURIComponent(citation.ref)}`
    case 'passage':
      return null
  }
}

export const TOOL_LABEL: Record<string, string> = {
  regras_para_ia: 'regras para IA',
  padrao: 'padrão',
  buscar_padroes: 'busca de padrões',
  sistema: 'ficha de sistema',
  buscar_sistemas: 'busca de sistemas',
  glossario: 'glossário',
  decisoes_pendentes: 'decisões pendentes',
  buscar: 'busca no handbook',
}
