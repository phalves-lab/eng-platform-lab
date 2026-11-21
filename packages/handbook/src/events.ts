import { type Section, normalize, sourceOf } from './markdown.js'

export interface EventContract {
  topic: string
  event: string
  producer: string
  consumers: string[]
  payload: string
  source: string
}

export interface SystemEvents {
  produces: EventContract[]
  consumes: EventContract[]
}

interface NamedSystem {
  name: string
  fields: Record<string, string>
}

const SEPARATOR_ROW = /^\|[\s:|-]+\|$/
const MODULE_SOURCE = /catalog\/modules\/([a-z0-9][a-z0-9-]*)\.ya?ml/

const cells = (line: string) =>
  line
    .trim()
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())

const tableRows = (body: string) =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !SEPARATOR_ROW.test(line))
    .map(cells)

/**
 * Reads every markdown table whose header has the Tópico, Evento, Produtor and Consumidores
 * columns. Consumers are comma separated; rows without topic, event or producer are skipped.
 */
export const readEvents = (sections: Section[]): EventContract[] =>
  sections.flatMap((section) => {
    const [header, ...rows] = tableRows(section.body)
    if (!header) return []
    const column = (title: string) => header.findIndex((cell) => normalize(cell) === title)
    const index = {
      topic: column('topico'),
      event: column('evento'),
      producer: column('produtor'),
      consumers: column('consumidores'),
      payload: column('o que carrega'),
    }
    if (index.topic < 0 || index.event < 0 || index.producer < 0 || index.consumers < 0) return []
    return rows.flatMap((row) => {
      const topic = row[index.topic] ?? ''
      const event = row[index.event] ?? ''
      const producer = row[index.producer] ?? ''
      if (!topic || !event || !producer) return []
      return [
        {
          topic,
          event,
          producer,
          consumers: (row[index.consumers] ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
          payload: index.payload >= 0 ? (row[index.payload] ?? '') : '',
          source: sourceOf(section),
        },
      ]
    })
  })

/**
 * Contracts of a topic or event: exact topic, exact event or `topic/event` first, then any
 * contract whose topic or event contains the query.
 */
export const findEvents = (events: readonly EventContract[], query: string): EventContract[] => {
  const target = normalize(query).replace(/^#/, '')
  if (!target) return []
  const exact = events.filter(
    (contract) =>
      normalize(contract.topic) === target ||
      normalize(contract.event) === target ||
      normalize(`${contract.topic}/${contract.event}`) === target,
  )
  if (exact.length) return exact
  return events.filter(
    (contract) =>
      normalize(contract.topic).includes(target) || normalize(contract.event).includes(target),
  )
}

/** Events the system produces and consumes, matched by the system card name. */
export const systemEvents = (
  events: readonly EventContract[],
  system: Pick<NamedSystem, 'name'>,
): SystemEvents => {
  const name = normalize(system.name)
  return {
    produces: events.filter((contract) => normalize(contract.producer) === name),
    consumes: events.filter((contract) =>
      contract.consumers.some((consumer) => normalize(consumer) === name),
    ),
  }
}

/** Module of `catalog/modules` cited in the `Fontes` field of a system card, if any. */
export const moduleOf = (system: NamedSystem): string | null =>
  MODULE_SOURCE.exec(system.fields['Fontes'] ?? '')?.[1] ?? null
