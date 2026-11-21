import { useCallback, useSyncExternalStore } from 'react'
import { type HashState, parseHash, toHash } from '@/lib/routes'

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

/** Rota e conjunto de dados ficam no hash, para o link compartilhado abrir na mesma tela. */
export const useHashState = () => {
  const hash = useSyncExternalStore(subscribe, getHash)
  const state = parseHash(hash)

  const navigate = useCallback((next: Partial<HashState>) => {
    window.location.hash = toHash({ ...parseHash(window.location.hash), ...next })
  }, [])

  return { ...state, navigate }
}
