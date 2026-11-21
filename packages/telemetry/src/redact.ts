import type { Attributes } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node'

const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g
const LONG_NUMBER = /(?<![\w-])(?:\d[ .-]?){8,}\d(?![\w-])/g
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|e-?mail|cpf/i
const MAX_DEPTH = 4

/** Masks e-mail addresses and any run of nine or more digits (CPF, phone, card, student ID). */
export const scrubText = (text: string) =>
  text.replace(EMAIL, '[e-mail]').replace(LONG_NUMBER, '[número]')

/**
 * Copies a log payload masking personal data in every string and dropping the value of keys
 * that usually carry credentials or contact data.
 */
export const scrubValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return scrubText(value)
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message) }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[removido]' : scrubValue(item, depth + 1),
    ]),
  )
}

const URL_KEYS = ['url.full', 'http.url', 'http.target', 'url.path']
const DROPPED_KEYS = new Set([
  'url.query',
  'user_agent.original',
  'http.user_agent',
  'client.address',
  'http.client_ip',
  'net.peer.ip',
  'network.peer.address',
  'enduser.id',
])

/** Removes query strings, client addresses and user agents from span attributes. */
export const redactAttributes = (attributes: Attributes): Attributes => {
  const result: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (DROPPED_KEYS.has(key)) continue
    result[key] =
      URL_KEYS.includes(key) && typeof value === 'string' ? (value.split('?')[0] ?? '') : value
  }
  return result
}

type ExportCallback = Parameters<SpanExporter['export']>[1]

const redactSpan = (span: ReadableSpan): ReadableSpan =>
  Object.assign(Object.create(span) as ReadableSpan, {
    attributes: redactAttributes(span.attributes),
  })

/** Span exporter that strips personal data from every span before it leaves the process. */
export class RedactingSpanExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: ExportCallback): void {
    this.inner.export(spans.map(redactSpan), resultCallback)
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve()
  }
}
