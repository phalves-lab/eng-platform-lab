import type { PanelData } from '@lab/eng-metrics/contract'

const isPanelData = (value: unknown): value is PanelData =>
  typeof value === 'object' &&
  value !== null &&
  (value as PanelData).schemaVersion === 1 &&
  Array.isArray((value as PanelData).datasets)

/** Lê o `data.json` publicado ao lado da página. Não chama nenhuma API externa. */
export const loadPanelData = async (
  fetchImpl: typeof fetch = fetch,
  url = './data.json',
): Promise<PanelData> => {
  const response = await fetchImpl(url, { cache: 'no-store' })
  if (!response.ok)
    throw new Error(`Não foi possível ler os dados do painel (HTTP ${response.status}).`)
  const body: unknown = await response.json()
  if (!isPanelData(body)) throw new Error('Os dados do painel estão em um formato desconhecido.')
  return body
}
