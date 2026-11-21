import type { PanelData } from '@lab/eng-metrics/contract'
import { useEffect, useState } from 'react'
import { loadPanelData } from '@/lib/data'

export type PanelDataState =
  | { status: 'loading' }
  | { status: 'ready'; data: PanelData }
  | { status: 'error'; message: string }

export const usePanelData = (): PanelDataState => {
  const [state, setState] = useState<PanelDataState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadPanelData()
      .then((data) => {
        if (active) setState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Erro ao ler os dados do painel.',
          })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
