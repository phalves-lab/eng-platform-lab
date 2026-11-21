import { ConversationRepository, createPool } from '@lab/database'
import type { PortalConfig } from '../config/config.js'

export const CONVERSATION_BACKEND = Symbol('CONVERSATION_BACKEND')

export type ConversationStore = Pick<
  ConversationRepository,
  'appendTurn' | 'list' | 'find' | 'remove'
>

export interface ConversationBackend {
  store: ConversationStore
  close: () => Promise<void>
}

/** Chat history lives in Postgres; without `DATABASE_URL` the portal answers but keeps nothing. */
export const createConversationBackend = (
  source: PortalConfig['panelSource'],
): ConversationBackend | null => {
  if (source.kind !== 'database') return null
  const pool = createPool({ connectionString: source.url, max: 3, applicationName: 'portal-api' })
  return { store: new ConversationRepository(pool), close: () => pool.end() }
}
